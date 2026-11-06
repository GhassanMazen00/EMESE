ايميز لتوريدات الملابس | بانر 300×100
=====================================

الملفات
-------
emese-banner.svg
    التصميم الأساسي. الكلام متحوّل لأشكال، فبيظهر مظبوط في أي برنامج وعلى أي جهاز،
    وتقدر تكبّره أو تصغّره لأي مقاس من غير ما يبوظ. ده الملف اللي تبعته لأي حد.

emese-banner-editable.svg
    نفس التصميم بالظبط، بس الكلام نص حقيقي تقدر تغيّره.
    افتحه في Illustrator أو Inkscape أو Figma بعد ما تسطّب الخطين اللي في فولدر fonts.

emese-banner-300x100cm.pdf
    للمطبعة: فيكتور، مقاسه 300×100 سم، وينفع يتطبع بأي مقاس تاني بنفس النسبة (3 لـ 1).

emese-banner-300x100.png  (وكمان 600x200 و 900x300 و 3000x1000)
    صور جاهزة للنت والسوشيال. 300x100 هي المقاس الأصلي، والأكبر للشاشات عالية الدقة.

light/
    نفس التصميم بخلفية فاتحة، لو حبيت بديل.

fonts/
    خط Alexandria (مجاني، رخصة OFL في OFL.txt). لازم بس للنسخة اللي بتتعدّل.

لو هتعدّل الكلام
---------------
1. سطّب Alexandria-Black.ttf و Alexandria-SemiBold.ttf من فولدر fonts.
2. افتح emese-banner-editable.svg. كل عنصر ليه اسم:
   brand (ايميز)، line1 (لتوريدات)، line2 (الملابس)، dot (النقطة الماجنتا)،
   stitch (الخياطة اللي حوالين)، background (الخلفية).
3. في Illustrator: لو الحروف العربي ظهرت مفكوكة أو بالعكس، اختار النص وخلّي الـ Composer
   "Middle Eastern & South Asian" (من قايمة Paragraph).

الألوان
-------
النسخة الأساسية (غامقة):
    الخلفية      #111111   (للمطبعة: C60 M40 Y40 K100)
    ايميز        #FFFFFF
    السطرين      #DCD8D1
    النقطة       #E6007E   (ماجنتا: C0 M100 Y0 K0)
    الخياطة      #ECE7DF بشفافية 62%
النسخة الفاتحة:
    الخلفية #F3F1EC، ايميز #000000، السطرين #3A3834، النقطة #E6007E، الخياطة #000000 بشفافية 38%
الخط: Alexandria Black لكلمة ايميز، و Alexandria SemiBold للسطرين.

للمطبعة
-------
الكلام بعيد عن حرف البانر بمسافة كفاية للعيون (الحلقات) أو الثنية.
لو المطبعة طلبت bleed: الخلفية لون واحد، فينفع تتمدّ براحتها.


EMESE store banner, 300 x 100 (English)
=======================================
emese-banner.svg              Main file. Text converted to shapes: identical in every app, scales to any size.
emese-banner-editable.svg     Same design with live, editable text. Install the fonts in fonts/ first.
emese-banner-300x100cm.pdf    Vector PDF at 300 x 100 cm for a print shop; prints at any size with the same 3:1 ratio.
emese-banner-*.png            300 x 100 px for screens, plus 2x, 3x and 10x sizes.
light/                        The same design on a light background.
fonts/                        Alexandria (free, SIL Open Font License).

In Illustrator, if the Arabic letters look disconnected, select the text and set the paragraph composer
to "Middle Eastern & South Asian".

Colours (main): background #111111, brand #FFFFFF, lines #DCD8D1, dot #E6007E, stitch #ECE7DF at 62%.
Light: background #F3F1EC, brand #000000, lines #3A3834, dot #E6007E, stitch #000000 at 38%.

To rebuild every file from source: python src/build.py && node src/export.js
