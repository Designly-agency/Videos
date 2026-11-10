# Designly — موقع سابقة أعمال الفيديو

موقع static سريع جدًا: صفحة واحدة حوالي 30KB، وكل الفيديوهات جاية من **Bunny Stream**، والمجالات هي الـ **Collections** اللي في Bunny.

## إزاي بيشتغل
```
Bunny Stream (فيديوهات + Collections)  →  build.mjs  →  dist/index.html  →  Cloudflare Pages
```
مع كل Deploy، السكريبت بيسحب الفيديوهات الجاهزة من Bunny ويبني الصفحة. مفيش أي database ولا server.

## الملفات
| الملف | وظيفته |
|---|---|
| `site.config.json` | اسم البراند، والألوان، ورقم الواتساب، وأسماء المجالات بالعربي |
| `build.mjs` | سكريبت البناء (من غير أي dependencies) |
| `src/` | التصميم (HTML / CSS / JS) |
| `public/` | اللوجو وصورة المشاركة (og.jpg) |

## تجهيز Bunny Stream
1. Stream ← Add Video Library ← الاسم `designly-portfolio`.
2. من **Collections** اعمل collection لكل مجال، **بنفس الأسماء الإنجليزي** اللي في `site.config.json` (مثلًا Real Estate، Food، Beauty).
3. ارفع كل فيديو جوه الـ collection بتاعته.
4. **اسم الفيديو** بيتكتب بالشكل ده:
   - `اسم العميل | عنوان الفيديو`، مثلًا `مطعم سرايا | إعلان الافتتاح`
   - لو حطيت `★` في أول الاسم، الفيديو بيظهر في الأول (مميز).
5. Library ← **Encoding**: فعّل **WebP Animated Preview** (ده الـ preview اللي بيشتغل لما تعدّي بالماوس).
6. Library ← **Player** (اختياري): غيّر لون المشغل للون البراند.
7. Library ← **API**: هتاخد منها 3 حاجات: Library ID، و API Key، و CDN Hostname.

## الرفع على Cloudflare Pages
1. ارفع الفولدر ده على repo في حساب GitHub الجديد.
2. Cloudflare ← Workers & Pages ← Create ← Pages ← Connect to Git ← اختار الـ repo.
3. الإعدادات:
   - Build command: `node build.mjs`
   - Build output directory: `dist`
4. Environment variables (اعمل الـ API key **Secret**):
   - `BUNNY_LIBRARY_ID`
   - `BUNNY_API_KEY`
   - `BUNNY_CDN_HOST`
5. Deploy.

## ربط الدومين (شوبيفاي)
1. Cloudflare Pages ← Custom domains ← `videos.designly-agency.com`
2. شوبيفاي ← Domains ← امسح `videos` من جدول **Subdomains** (لأنه بيشاور على المتجر).
3. شوبيفاي ← DNS settings ← Manage ← Add custom record ← **CNAME**:
   - Name: `videos`
   - Points to: `<اسم-المشروع>.pages.dev`

## إضافة فيديو جديد
ارفعه على Bunny جوه الـ collection بتاعته، وبعدين من Cloudflare اعمل **Retry deployment**.
وللتحديث التلقائي: Pages ← Settings ← **Deploy hooks**، اعمل hook وحطه في Bunny Webhook، أو شغّله يوميًا.

## روابط جاهزة للعملاء
- `videos.designly-agency.com/?industry=real-estate`: شغل العقارات بس
- `videos.designly-agency.com/?industry=food&format=v`: ريلز المطاعم بس
- زرار **نسخ الرابط** جوه أي فيديو بيدي لينك مباشر للفيديو ده

## تجربة على جهازك
```
node build.mjs          # وضع تجريبي
npx serve dist
```
