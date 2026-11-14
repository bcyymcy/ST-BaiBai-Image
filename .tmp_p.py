import io
def rep(p,a,b):
    s=io.open(p,encoding='utf-8',newline='').read()
    assert s.count(a)==1,(p,a[:40]); io.open(p,'w',encoding='utf-8',newline='').write(s.replace(a,b))
f='src/autoTag/charAnchors.ts'
rep(f,'''Do not invent details.
5.''','''Do not invent details.
4b. Describe only what IS there. Never write absence statements ("no scars or marks are noted", "no distinctive features") and never write meta wording ("main features", "notable traits", "is described as", "recorded"). If a field is empty, simply leave it out.
5.''')
f='src/autoTag/mossSpec.ts'
rep(f,'''用词一字不改，只允许把开头的 A girl / A young man 换成 The girl / The young man 接上下文。''','''用词一字不改，只允许把开头的 A girl / A young man 换成 The girl / The young man 接上下文。
  例外：库里的句子若带有「没有某特征」的否定说法（no scars or marks are noted）或「main features / notable」这类说明腔，删掉这些部分，只留看得见的外貌。''')
rep(f,'''- **方位只用一套说法**：''','''- **镜头角度只写一次**：景别后最多跟一个角度（from above / from the side / at eye level 等），全段不再出现第二个角度说法（high three-quarter angle 和 seen from above 同时出现就会打架）。
- **方位只用一套说法**：''')
rep(f,'''kneels between her legs and leans over her, seen from above.''','''kneels between her legs and leans over her.''')
