"""pptx_template_kit.py — テンプレート型デザイン（design-directions-business.md）の本文ページを python-pptx で組む部品集。

会社のテンプレート（ロゴ・罫線・コピーライト・ページ番号はマスター側）を開き、指定レイアウトで本文ページを追加して、
design-directions-business.md の部品（サブタイトル帯・カード・見出し帯・STEP 矢羽根・番号丸・まとめ帯・表…）を描く。
ロゴや会社名はこのファイルに持たない（すべてテンプレートのマスターから来る）。

使い方（生成スクリプトの冒頭）:
    import sys; sys.path.insert(0, r"C:/Users/<ユーザー>/.claude/skills/slide-maker/assets")
    from pptx_template_kit import *
    deck = Deck(r"<テンプレート>.pptx")
    s = deck.slide("1．はじめに")
    subtitle_bar(s, "本日の進め方")
    ...
    deck.save(r"<作業フォルダ>/<タイトル>_draft.pptx")

座標はすべてインチ（スライド 13.333 x 7.5）。色は 6 桁の16進文字列。
"""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.dml.color import RGBColor
from pptx.oxml.ns import qn
from lxml import etree

# ---- トークン（design-directions-business.md と同じ値。変えるときは両方そろえる） ----
FONT = "メイリオ"
NAVY = "17375E"      # 見出し帯・強調文字・STEP1・まとめの濃色帯
MID = "4F81BD"       # 矢羽根（STEP2〜）・アイコン丸・表の見出し行
TX2 = "1F497D"       # サブタイトル帯の文字
TINT = "CCDDF2"      # サブタイトル帯の地
MSG = "DEF2FF"       # まとめ帯の地
PALE = "F2F6FB"      # 表の縞・面の地（ごく淡い）
BORDER = "D9D9D9"    # カード枠・区切り線
INK = "000000"       # 本文
MUTED = "7F7F7F"     # 注記・出典
ACCENT = "C0504D"    # ★ などの注意印（1スライド数か所まで）
WHITE = "FFFFFF"

LEFT = 0.46          # 本文の左端
WIDTH = 12.42        # 本文の幅（右端 12.88）
SUB_Y, SUB_H = 1.02, 0.47   # サブタイトル帯
BODY_TOP = 1.62      # サブタイトル帯の下から本文を始める位置
BODY_BOTTOM = 6.85   # 本文の下限（その下はコピーライト・ページ番号の領域）

_ALIGN = {"l": PP_ALIGN.LEFT, "c": PP_ALIGN.CENTER, "r": PP_ALIGN.RIGHT}
_ANCHOR = {"t": MSO_ANCHOR.TOP, "m": MSO_ANCHOR.MIDDLE, "b": MSO_ANCHOR.BOTTOM}
_SHADOW = ('<a:effectLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
           '<a:outerShdw blurRad="50000" dist="20000" dir="5400000" rotWithShape="0">'
           '<a:srgbClr val="000000"><a:alpha val="20000"/></a:srgbClr></a:outerShdw></a:effectLst>')


class Deck:
    """テンプレートを開き、本文ページだけを足していく。"""

    def __init__(self, template, layout_name="2_タイトルとコンテンツ"):
        self.prs = Presentation(template)
        if len(self.prs.slides._sldIdLst):
            raise ValueError("テンプレートにスライドが残っています。スライド 0 枚の基盤テンプレートを使ってください")
        self.layout = None
        for m in self.prs.slide_masters:
            for L in m.slide_layouts:
                if L.name == layout_name:
                    self.layout = L
        if self.layout is None:
            names = [L.name for m in self.prs.slide_masters for L in m.slide_layouts]
            raise ValueError("レイアウト %r が見つかりません。候補: %s" % (layout_name, names))

    def slide(self, title):
        """本文ページを1枚足す。タイトル（例「3．現在の業務と課題」）はレイアウトのプレースホルダに入れる。"""
        s = self.prs.slides.add_slide(self.layout)
        for ph in list(s.placeholders):
            if ph.placeholder_format.type is not None and "TITLE" in str(ph.placeholder_format.type):
                ph.left, ph.top = Inches(LEFT), Inches(0.38)
                tf = ph.text_frame
                tf.text = ""
                r = tf.paragraphs[0].add_run()
                r.text = title
                _font(r, 28, True, INK)
            else:  # 本文プレースホルダは使わない（図形で組む）。残すと「テキストを入力」が見える
                ph._element.getparent().remove(ph._element)
        return s

    def save(self, path):
        self.prs.save(path)


# ---- 内部 ----
def _font(run, size, bold=False, color=INK, italic=False):
    f = run.font
    f.name = FONT
    f.size = Pt(size)
    f.bold = bold
    f.italic = italic
    f.color.rgb = RGBColor.from_string(color)
    rPr = run._r.get_or_add_rPr()
    latin = rPr.find(qn("a:latin"))
    for tag in ("a:ea", "a:cs"):
        if rPr.find(qn(tag)) is None:
            el = etree.SubElement(rPr, qn(tag))
            el.set("typeface", FONT)
            latin.addnext(el) if tag == "a:ea" else rPr.find(qn("a:ea")).addnext(el)
    rPr.set("lang", "ja-JP")
    rPr.set("altLang", "en-US")


def _fill(shape, color):
    if color is None:
        shape.fill.background()
    else:
        shape.fill.solid()
        shape.fill.fore_color.rgb = RGBColor.from_string(color)


def _line(shape, color, width_pt=1.0):
    if color is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = RGBColor.from_string(color)
        shape.line.width = Pt(width_pt)


def _paras(tf, content, size, bold, color, align, line_spacing, space_after):
    """content: str（\\n で段落）／段落のリスト。段落は str か [(文字, {size,bold,color}), ...]。"""
    if isinstance(content, str):
        content = content.split("\n")
    tf.text = ""
    for i, para in enumerate(content):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = _ALIGN[align]
        if line_spacing:
            p.line_spacing = line_spacing
        if space_after:
            p.space_after = Pt(space_after)
        runs = [(para, {})] if isinstance(para, str) else para
        for txt, o in runs:
            r = p.add_run()
            r.text = txt
            _font(r, o.get("size", size), o.get("bold", bold), o.get("color", color))


# ---- 基本図形 ----
def text(s, x, y, w, h, content, size=14, bold=False, color=INK, align="l", anchor="t",
         ins=(0, 0, 0, 0), line_spacing=None, space_after=0, wrap=True):
    """枠なしのテキスト。ins は (左, 上, 右, 下) のインチ。"""
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = wrap
    tf.auto_size = None
    tf.vertical_anchor = _ANCHOR[anchor]
    tf.margin_left, tf.margin_top, tf.margin_right, tf.margin_bottom = [Inches(v) for v in ins]
    _paras(tf, content, size, bold, color, align, line_spacing, space_after)
    return tb


def box(s, x, y, w, h, fill=WHITE, line=None, line_w=1.0, shape="rect", adj=None, shadow=False,
        content=None, size=14, bold=False, color=INK, align="l", anchor="m", ins=(0.1, 0.05, 0.1, 0.05),
        line_spacing=None, space_after=0):
    """塗り・枠つきの図形（文字も入れられる）。shape: rect / round / home / chevron / ellipse。adj は角丸などの調整値(0〜1)。"""
    kind = {"rect": MSO_SHAPE.RECTANGLE, "round": MSO_SHAPE.ROUNDED_RECTANGLE, "home": MSO_SHAPE.PENTAGON,
            "chevron": MSO_SHAPE.CHEVRON, "ellipse": MSO_SHAPE.OVAL}[shape]
    sp = s.shapes.add_shape(kind, Inches(x), Inches(y), Inches(w), Inches(h))
    _fill(sp, fill)
    _line(sp, line, line_w)
    if adj is not None:
        sp.adjustments[0] = adj
    # python-pptx の図形はテーマの既定スタイル（影つき）を参照するため、影は明示的に決める
    sp._element.spPr.append(etree.fromstring(_SHADOW) if shadow else
                            etree.fromstring('<a:effectLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>'))
    tf = sp.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    tf.vertical_anchor = _ANCHOR[anchor]
    tf.margin_left, tf.margin_top, tf.margin_right, tf.margin_bottom = [Inches(v) for v in ins]
    if content is not None:
        _paras(tf, content, size, bold, color, align, line_spacing, space_after)
    return sp


# ---- 部品（design-directions-business.md の「部品」） ----
def subtitle_bar(s, content):
    """タイトル直下の淡い青の帯（そのページの小見出し・問い）。"""
    return box(s, LEFT, SUB_Y, WIDTH, SUB_H, fill=TINT, content=content, size=24, bold=True, color=TX2,
               anchor="m", ins=(0.2, 0.04, 0.1, 0))


def lead(s, strong, rest="", y=BODY_TOP, h=0.4):
    """本文冒頭のリード文。強調部（紺・太字）＋補足（黒）。"""
    para = [(strong, {"size": 16, "bold": True, "color": NAVY})]
    if rest:
        para.append((rest, {"size": 14, "color": INK}))
    return text(s, LEFT, y, WIDTH, h, [para])


def card(s, x, y, w, h):
    """白いカード（角丸ごく小・薄灰の枠・薄い影）。"""
    return box(s, x, y, w, h, fill=WHITE, line=BORDER, line_w=1.0, shape="round", adj=0.04, shadow=True)


def header_bar(s, x, y, w, content, h=0.42, fill=NAVY, size=14):
    """カードや列の上に載せる見出し帯（紺地・白太字）。"""
    return box(s, x, y, w, h, fill=fill, content=content, size=size, bold=True, color=WHITE,
               anchor="m", ins=(0.2, 0.03, 0.15, 0))


def outline_box(s, x, y, w, h, content, size=14):
    """紺の細枠の囲み（見出し・ラベル用）。"""
    return box(s, x, y, w, h, fill=WHITE, line=NAVY, line_w=1.5, shape="round", adj=0.12,
               content=content, size=size, bold=True, color=NAVY, anchor="m", align="c")


def separator(s, x, y, w):
    """薄灰の区切り線（行の区切り・項目の間）。"""
    return box(s, x, y, w, 0.01, fill=BORDER)


def step_flow(s, labels, y, x=LEFT, w=None, h=0.5, gap=0.12, size=16):
    """STEP の矢羽根。1つ目は五角形（紺）、2つ目以降は山形（中間の青）。w を省略すると本文幅に等分する。"""
    n = len(labels)
    if w is None:
        w = (WIDTH - gap * (n - 1)) / n
    shapes = []
    for i, lb in enumerate(labels):
        shapes.append(box(s, x + i * (w + gap), y, w, h, fill=NAVY if i == 0 else MID,
                          shape="home" if i == 0 else "chevron", content=lb, size=size, bold=True,
                          color=WHITE, align="c", anchor="m", ins=(0.25, 0, 0.25, 0)))
    return shapes, w


def num_circle(s, x, y, n, d=0.42, fill=MID, size=14):
    """番号の丸（白抜き数字）。アイコンの代わりにも使う。"""
    return box(s, x, y, d, d, fill=fill, shape="ellipse", content=str(n), size=size, bold=True,
               color=WHITE, align="c", anchor="m", ins=(0, 0, 0, 0))


def message_band(s, content, y=6.25, h=0.5, size=15):
    """ページ下のまとめ帯（ごく淡い水色・紺太字）。1ページに1本まで。"""
    return box(s, LEFT, y, WIDTH, h, fill=MSG, content=content, size=size, bold=True, color=NAVY,
               anchor="m", ins=(0.2, 0.04, 0.2, 0.04))


def footnote(s, content, y=6.88):
    """注記・出典（灰・10.5pt）。コピーライト行に重ならない高さに置く。"""
    return text(s, LEFT, y, WIDTH, 0.25, content, size=10.5, color=MUTED)


def bullets(s, x, y, w, h, items, size=12, color=INK, mark="・", space_after=3, line_spacing=None):
    """箇条書き（行頭の記号は文字で付ける）。items の要素は str か [(文字, opts), ...]。"""
    paras = []
    for it in items:
        if isinstance(it, str):
            paras.append(mark + it)
        else:
            paras.append([(mark, {})] + list(it))
    return text(s, x, y, w, h, paras, size=size, color=color, space_after=space_after, line_spacing=line_spacing)


def table(s, x, y, col_w, rows, row_h=0.39, size=13, header=True, bold_cols=(), align=None):
    """表。rows は行のリスト（1行目が見出し）。col_w は列幅（インチ）のリスト。
    見出し行は中間の青・白太字、本文行は白と淡青の縞（テンプレートの既定の表スタイル）。"""
    nr, nc = len(rows), len(col_w)
    gf = s.shapes.add_table(nr, nc, Inches(x), Inches(y), Inches(sum(col_w)), Inches(row_h * nr))
    tbl = gf.table
    tblPr = tbl._tbl.tblPr
    tblPr.set("firstRow", "1" if header else "0")
    tblPr.set("bandRow", "1")
    sid = tblPr.find(qn("a:tableStyleId"))
    if sid is None:
        sid = etree.SubElement(tblPr, qn("a:tableStyleId"))
    sid.text = "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"  # 中間スタイル2 - アクセント1
    for j, cw in enumerate(col_w):
        tbl.columns[j].width = Inches(cw)
    for i in range(nr):
        tbl.rows[i].height = Inches(row_h)
        for j in range(nc):
            c = tbl.cell(i, j)
            c.margin_left = c.margin_right = Inches(0.08)
            c.margin_top = c.margin_bottom = Inches(0.03)
            c.vertical_anchor = MSO_ANCHOR.MIDDLE
            val = rows[i][j]
            is_head = header and i == 0
            c.text_frame.text = ""
            p = c.text_frame.paragraphs[0]
            a = "c" if is_head else ((align[j] if align else "l"))
            p.alignment = _ALIGN[a]
            runs = [(val, {})] if isinstance(val, str) else val
            for txt, o in runs:
                r = p.add_run()
                r.text = txt
                _font(r, o.get("size", size), o.get("bold", is_head or j in bold_cols),
                      o.get("color", WHITE if is_head else INK))
    return gf
