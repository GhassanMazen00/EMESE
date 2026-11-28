import subprocess,re,sys
thr,rng,rel=sys.argv[1:4]
cuts=[(2.00,0.3),(5.00,0.6),(11.25,0.6),(16.92,0.5),(22.05,0.7)]
pts=[0]+[c for c,_ in cuts]+[27.07]
parts=[];f=[]
for i in range(len(pts)-1):
    f.append(f"[0:a]atrim={pts[i]}:{pts[i+1]},asetpts=PTS-STARTPTS[v{i}]"); parts.append(f"[v{i}]")
    if i<len(cuts):
        f.append(f"anullsrc=r=44100:cl=mono,atrim=0:{cuts[i][1]}[s{i}]"); parts.append(f"[s{i}]")
f.append("".join(parts)+f"concat=n={len(parts)}:v=0:a=1[cat]")
base=("highpass=f=75:poles=2,highpass=f=75:poles=2,equalizer=f=120:t=q:w=1:g=-4,lowpass=f=13000,"
      "afftdn=nf=-40:nr=24:tn=1,afftdn=nf=-50:nr=12,"
      f"agate=detection=rms:threshold={thr}:ratio=4:range={rng}:attack=2:release={rel}:knee=4,"
      "acompressor=threshold=-20dB:ratio=2.5:attack=8:release=160:makeup=1.5,"
      "equalizer=f=3500:t=q:w=1.2:g=2")
def run(chain,out):
    g=f+[f"[cat]{chain}[out]"]
    return subprocess.run(["ffmpeg","-y","-hide_banner","-i","voice.mp3","-filter_complex",";".join(g),"-map","[out]","-ar","48000"]+(["-f","null","-"] if out=="-" else [out]),capture_output=True,text=True).stderr
err=run(base+",ebur128","-")
I=float(re.findall(r"I:\s+(-?[\d.]+) LUFS",err)[-1]); gain=-16-I
run(base+f",volume={gain}dB,alimiter=limit=0.84","voice_clean.wav")
import librosa, numpy as np
o,sr=librosa.load('voice.mp3',sr=16000); c,_=librosa.load('voice_clean.wav',sr=16000)
def shift(t): return t+sum(g for p,g in cuts if t>p)
hop=160
ro=20*np.log10(librosa.feature.rms(y=o,hop_length=hop)[0]+1e-9); rc=20*np.log10(librosa.feature.rms(y=c,hop_length=hop)[0]+1e-9)
tot=bad=0
for i,v in enumerate(ro):
    if v>-38:
        j=int(shift(i*hop/sr)*sr/hop)
        if j<len(rc): tot+=1; bad+= rc[j]<-50
pa=rc[int(3.62*100):int(3.8*100)].mean()
print(thr,rng,rel,'muted',bad,'/',tot,'pause dB',round(float(pa),1))
