"""Build a review gallery from real desktop captures, without rendering a QA scene."""
import json, pathlib, shutil
from PIL import Image

root = pathlib.Path(__file__).resolve().parents[2]
out = root / 'test-results/furniture-preview'
(out / 'images').mkdir(parents=True, exist_ok=True)
catalogue = json.loads((root / 'assets/furniture/models.json').read_text(encoding='utf8'))
characters = {c['id']: c['name'] for c in json.loads((root / 'assets/characters.json').read_text(encoding='utf8'))}
entries = []
for item in catalogue['items'].values():
    source = root / item['thumbnail']
    target = out / 'images' / (item['id'] + '.png')
    shutil.copyfile(source, target)
    entries.append(dict(id=item['id'], name=item['names']['zh'], kind='decor', student='', image='images/' + target.name, note='桌宠实际画面 · 家具摆放'))

for record in sorted((root / 'test-results/furniture-review/interactions').glob('*.json')):
    data = json.loads(record.read_text(encoding='utf8'))
    item = catalogue['items'][data['id']]
    samples = data['samples']
    if not samples:
        continue
    card = Image.new('RGBA', (300 * len(samples), 300), '#edf1f7')
    for i, sample in enumerate(samples):
        image = Image.open(record.with_name(record.stem + '-' + str(i) + '.png')).convert('RGBA')
        b = sample['frame']['visibleBounds']; v = sample['viewport']; scale = image.width / v['width']
        left = max(0, b['left'] - 12) * scale; top = max(0, b['top'] - 12) * scale
        right = min(v['width'], b['right'] + 12) * scale; bottom = min(v['height'], b['bottom'] + 12) * scale
        if right > left and bottom > top:
            image = image.crop((left, top, right, bottom))
        image.thumbnail((292, 292))
        card.alpha_composite(image, (i * 300 + (300 - image.width) // 2, (300 - image.height) // 2))
    target = out / 'images' / (record.stem + '.png'); card.convert('RGB').save(target)
    blocked = item.get('disabledInteractions', {}).get(data['characterId']) or ('missing-animation' if item.get('missingAnimations') else None)
    entries.append(dict(id=data['id'], name=item['names']['zh'], kind='interaction', student=characters[data['characterId']], image='images/' + target.name,
                        note='专用互动未启用，保留摆放：' + blocked if blocked else '专用互动 · 动作中段、末段与循环衔接'))

data = json.dumps(entries, ensure_ascii=False).replace('</', '<\\/')
html = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>家具实际预览</title>
<style>body{margin:24px;font:15px system-ui;color:#27364b;background:#eef3f8}h1{font-size:25px}header{position:sticky;top:0;background:#eef3f8;padding:12px 0;z-index:2}input,select,button{padding:10px;font:inherit;margin:4px;border:1px solid #bfd2e2;border-radius:6px}input{width:min(380px,70vw)}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px}article{background:white;border-radius:12px;padding:12px}img{width:100%;height:235px;object-fit:contain;background:#edf1f7}small{display:block;overflow-wrap:anywhere;color:#66809a;margin:6px 0}p{line-height:1.6}.note{min-height:40px}.warn{color:#a64c29}a{color:inherit}nav{text-align:center;margin:15px}</style>
<h1>家具实际预览</h1><p>使用桌宠自身的镜头、材质、灯光和动画截帧。家具缩略图由同帧裁切得到。专用互动展示多个播放时刻；标记未启用的组合仅开放家具摆放。家具暂用分类编号，非官方译名。</p>
<header><input id="q" placeholder="搜索家具编号、模型名称或学生"><select id="kind"><option value="decor">家具摆放</option><option value="interaction">学生专用互动</option></select><span id="count"></span></header><main id="grid"></main><nav><button id="prev">上一页</button><span id="page"></span><button id="next">下一页</button></nav>
<script>const entries=DATA;let page=0;const el=id=>document.getElementById(id);function render(){const q=el('q').value.toLowerCase(),items=entries.filter(x=>x.kind===el('kind').value&&[x.id,x.name,x.student].join(' ').toLowerCase().includes(q)),pages=Math.max(1,Math.ceil(items.length/48));page=Math.max(0,Math.min(pages-1,page));el('grid').replaceChildren(...items.slice(page*48,(page+1)*48).map(x=>{const a=document.createElement('article'),link=document.createElement('a'),img=new Image(),title=document.createElement('b'),id=document.createElement('small'),note=document.createElement('p');link.href=x.image;link.target='_blank';img.src=x.image;img.loading='lazy';img.alt=x.name;link.append(img);title.textContent=x.name+(x.student?' · '+x.student:'');id.textContent=x.id;note.textContent=x.note;note.className='note'+(x.note.includes('未启用')?' warn':'');a.append(link,title,id,note);return a}));el('count').textContent=items.length+' 项';el('page').textContent=(page+1)+' / '+pages;el('prev').disabled=page===0;el('next').disabled=page+1===pages}el('q').oninput=el('kind').onchange=()=>{page=0;render()};el('prev').onclick=()=>{page--;render();scrollTo(0,0)};el('next').onclick=()=>{page++;render();scrollTo(0,0)};render();</script></html>'''.replace('DATA', data)
(out / 'index.html').write_text(html, encoding='utf8')
print(json.dumps({'furniture': len(catalogue['items']), 'interactions': len(entries) - len(catalogue['items']), 'gallery': str(out)}, ensure_ascii=False))
