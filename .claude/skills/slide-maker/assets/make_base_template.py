"""見本の pptx から、マスター・レイアウト・テーマだけを残した基盤テンプレートを作る。
スライド・変更履歴・サムネイル・文書プロパティ（作成者名・スライドのタイトル一覧）・セクション一覧を除去する。
usage: python -I make_base_template.py <src.pptx> <out.pptx>
"""
import sys
from pptx import Presentation
from pptx.oxml.ns import qn

src, out = sys.argv[1], sys.argv[2]
prs = Presentation(src)
part = prs.part

# 1) スライドを全部外す（関係を落とせば、保存時にスライドのパーツは書き出されない）
sldIdLst = prs.slides._sldIdLst
for sldId in list(sldIdLst):
    part.drop_rel(sldId.rId)
    sldIdLst.remove(sldId)

# 2) 変更履歴（changesInfo・revisionInfo）を外す
for rId, rel in list(part.rels.items()):
    if "changesInfo" in rel.reltype or "revisionInfo" in rel.reltype or "commentAuthors" in rel.reltype:
        part.drop_rel(rId)

# 3) セクション一覧（消したスライドの ID を参照していて、残すと修復ダイアログが出る）
pres_el = part._element
for ext in pres_el.findall(qn("p:extLst") + "/" + qn("p:ext")):
    if ext.find("{http://schemas.microsoft.com/office/powerpoint/2010/main}sectionLst") is not None:
        ext.getparent().remove(ext)

# 4) パッケージのサムネイル（顧客名入りの表紙）と app.xml（スライドのタイトル一覧）を外す
pkg = part.package
for rId, rel in list(pkg._rels.items()):
    if rel.reltype.endswith("/thumbnail") or rel.reltype.endswith("/extended-properties"):
        pkg._rels.pop(rId)

# 5) 文書プロパティを空にする（作成者・最終更新者の個人名）
cp = prs.core_properties
cp.author = ""
cp.last_modified_by = ""
cp.title = ""
cp.subject = ""
cp.keywords = ""
cp.comments = ""
cp.revision = 1

prs.save(out)
p2 = Presentation(out)
print("saved:", out)
print("slides:", len(p2.slides._sldIdLst))
for m in p2.slide_masters:
    print("master layouts:", [L.name for L in m.slide_layouts])
