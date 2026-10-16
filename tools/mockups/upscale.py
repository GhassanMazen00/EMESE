"""AI upscaling (Real-ESRGAN x4plus) for small product pictures, with no PyTorch needed.

The released PyTorch weights are read straight from the .pth zip, the network
(RRDBNet: 23 residual-in-residual dense blocks) is rebuilt as an ONNX graph and run
with onnxruntime in overlapping tiles, so it works on a plain CPU.

    python tools/mockups/upscale.py in.png out.png [--scale 2] [--texture 1.0]

--scale is the final size; the network always works at x4 and the result is then
resized down with Lanczos, which looks cleaner than a direct x2. --texture puts the
original fabric texture back (0 = the network's smooth result).
Weights: https://github.com/xinntao/Real-ESRGAN (BSD-3-Clause), downloaded on first use.
"""
import collections
import os
import pickle
import sys
import urllib.request
import zipfile

import numpy as np
from PIL import Image

URL = 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth'
CACHE = os.path.join(os.path.expanduser('~'), '.cache', 'emese')


# ------------------------------------------------------------ weights ---
def load_pth(path):
    """State dict of a zip-format .pth as numpy arrays."""
    zf = zipfile.ZipFile(path)
    root = zf.namelist()[0].split('/')[0]
    dtypes = {'FloatStorage': np.float32, 'HalfStorage': np.float16, 'DoubleStorage': np.float64,
              'LongStorage': np.int64, 'IntStorage': np.int32}

    def rebuild(storage, offset, size, stride, *_):
        it = storage.itemsize
        return np.lib.stride_tricks.as_strided(storage[offset:], shape=tuple(size),
                                               strides=[s * it for s in stride]).copy()

    class Loader(pickle.Unpickler):
        def find_class(self, mod, name):
            if name in ('_rebuild_tensor_v2', '_rebuild_tensor'):
                return rebuild
            if name == '_rebuild_parameter':
                return lambda data, *_: data
            if mod == 'torch' and name.endswith('Storage'):
                return name
            if mod == 'collections' and name == 'OrderedDict':
                return collections.OrderedDict
            return super().find_class(mod, name)

        def persistent_load(self, pid):
            _, stype, key, _loc, _n = pid
            return np.frombuffer(zf.read(f'{root}/data/{key}'), dtypes[stype])

    with zf.open(f'{root}/data.pkl') as f:
        sd = Loader(f).load()
    for k in ('params_ema', 'params'):
        if k in sd:
            return sd[k]
    return sd


# ---------------------------------------------------------- the graph ---
def build_model(sd):
    from onnx import TensorProto, helper, numpy_helper

    nodes, inits = [], []
    count = [0]

    def name(p):
        count[0] += 1
        return f'{p}_{count[0]}'

    def const(v):
        n = name('c')
        inits.append(numpy_helper.from_array(np.asarray(v, np.float32), n))
        return n

    def conv(x, key):
        w, b = key + '.weight', key + '.bias'
        if w not in [i.name for i in inits]:
            inits.append(numpy_helper.from_array(sd[w].astype(np.float32), w))
            inits.append(numpy_helper.from_array(sd[b].astype(np.float32), b))
        y = name('conv')
        nodes.append(helper.make_node('Conv', [x, w, b], [y], pads=[1, 1, 1, 1], kernel_shape=[3, 3]))
        return y

    def lrelu(x):
        y = name('lrelu')
        nodes.append(helper.make_node('LeakyRelu', [x], [y], alpha=0.2))
        return y

    def cat(xs):
        y = name('cat')
        nodes.append(helper.make_node('Concat', xs, [y], axis=1))
        return y

    def axpy(a, x, y_):        # a * x + y
        m, s = name('mul'), name('add')
        nodes.append(helper.make_node('Mul', [x, const(a)], [m]))
        nodes.append(helper.make_node('Add', [m, y_], [s]))
        return s

    def up2(x):
        y = name('up')
        nodes.append(helper.make_node('Resize', [x, '', const([1, 1, 2, 2])], [y], mode='nearest'))
        return y

    def rdb(x, k):
        x1 = lrelu(conv(x, k + '.conv1'))
        x2 = lrelu(conv(cat([x, x1]), k + '.conv2'))
        x3 = lrelu(conv(cat([x, x1, x2]), k + '.conv3'))
        x4 = lrelu(conv(cat([x, x1, x2, x3]), k + '.conv4'))
        x5 = conv(cat([x, x1, x2, x3, x4]), k + '.conv5')
        return axpy(0.2, x5, x)

    nb = 1 + max(int(k.split('.')[1]) for k in sd if k.startswith('body.'))
    feat = conv('x', 'conv_first')
    h = feat
    for i in range(nb):
        o = rdb(rdb(rdb(h, f'body.{i}.rdb1'), f'body.{i}.rdb2'), f'body.{i}.rdb3')
        h = axpy(0.2, o, h)
    feat = axpy(1.0, conv(h, 'conv_body'), feat)
    feat = lrelu(conv(up2(feat), 'conv_up1'))
    feat = lrelu(conv(up2(feat), 'conv_up2'))
    out = conv(lrelu(conv(feat, 'conv_hr')), 'conv_last')
    nodes.append(helper.make_node('Identity', [out], ['y']))
    g = helper.make_graph(nodes, 'rrdbnet',
                          [helper.make_tensor_value_info('x', TensorProto.FLOAT, [1, 3, 'h', 'w'])],
                          [helper.make_tensor_value_info('y', TensorProto.FLOAT, [1, 3, 'H', 'W'])], inits)
    model = helper.make_model(g, opset_imports=[helper.make_opsetid('', 17)])
    model.ir_version = 8
    return model.SerializeToString()


def session():
    import onnxruntime as ort
    os.makedirs(CACHE, exist_ok=True)
    pth = os.path.join(CACHE, os.path.basename(URL))
    if not os.path.exists(pth):
        print('downloading', URL)
        urllib.request.urlretrieve(URL, pth)
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = os.cpu_count() or 4
    return ort.InferenceSession(build_model(load_pth(pth)), opts, providers=['CPUExecutionProvider'])


# ------------------------------------------------------------- tiling ---
def upscale_x4(img, sess, tile=160, pad=12, as_array=False):
    a = np.asarray(img.convert('RGB'), np.float32) / 255.0
    h, w, _ = a.shape
    out = np.zeros((h * 4, w * 4, 3), np.float32)
    for y0 in range(0, h, tile):
        for x0 in range(0, w, tile):
            y1, x1 = min(y0 + tile, h), min(x0 + tile, w)
            py0, px0 = max(y0 - pad, 0), max(x0 - pad, 0)
            py1, px1 = min(y1 + pad, h), min(x1 + pad, w)
            t = a[py0:py1, px0:px1].transpose(2, 0, 1)[None]
            r = sess.run(['y'], {'x': np.ascontiguousarray(t)})[0][0].transpose(1, 2, 0)
            oy, ox = (y0 - py0) * 4, (x0 - px0) * 4
            out[y0 * 4:y1 * 4, x0 * 4:x1 * 4] = r[oy:oy + (y1 - y0) * 4, ox:ox + (x1 - x0) * 4]
            print(f'  tile {y0},{x0}', flush=True)
    if as_array:
        return np.clip(out, 0, 1)
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8))


def keep_texture(img, big, k=1.0, sigma=4.0):
    """The network sharpens edges but irons out fine fabric texture: lay the original
    texture (from a plain enlargement) back on top, away from the edges it sharpened.
    `big` is a PIL image or a float array (0..1); the result is of the same kind."""
    from scipy import ndimage
    is_arr = isinstance(big, np.ndarray)
    sr = big * 255.0 if is_arr else np.asarray(big, np.float32)
    plain = np.asarray(img.resize((sr.shape[1], sr.shape[0]), Image.BICUBIC), np.float32)
    detail = plain - ndimage.gaussian_filter(plain, (sigma, sigma, 0))
    g = np.hypot(*np.gradient(ndimage.gaussian_filter(sr.mean(-1), 1.5)))
    edge = np.clip(g / 6.0, 0, 1)
    edge = ndimage.gaussian_filter(np.maximum(edge, ndimage.maximum_filter(edge, 5)), 2)
    out = np.clip(sr + k * detail * (1 - edge)[..., None], 0, 255)
    return out / 255.0 if is_arr else Image.fromarray((out + 0.5).astype(np.uint8))


def main(argv):
    src, dst = argv[0], argv[1]
    scale = float(argv[argv.index('--scale') + 1]) if '--scale' in argv else 4.0
    texture = float(argv[argv.index('--texture') + 1]) if '--texture' in argv else 1.0
    img = Image.open(src).convert('RGB')
    big = upscale_x4(img, session())
    if texture:
        big = keep_texture(img, big, texture)
    if scale != 4:
        big = big.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    big.save(dst)
    print('saved', dst, big.size)


if __name__ == '__main__':
    main(sys.argv[1:])
