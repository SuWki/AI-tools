"""Generate the four Word manuals from their maintained Markdown sources."""
from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
ROOT = Path(__file__).parent

def font(style, size, bold=False):
    style.font.name='Microsoft YaHei'
    style.font.size=Pt(size)
    style.font.bold=bold
    style.font.color.rgb=RGBColor(0,0,0)
    style.element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),'Microsoft YaHei')

for source in sorted(ROOT.glob('0*.md')):
    d=Document()
    sec=d.sections[0]
    sec.page_width=Inches(8.5); sec.page_height=Inches(11)
    sec.top_margin=Inches(.7);sec.bottom_margin=Inches(.7)
    sec.left_margin=Inches(.75);sec.right_margin=Inches(.75)
    for name,size in [('Normal',11),('Title',23),('Heading 1',16),('Heading 2',12)]:
        font(d.styles[name],size,name!='Normal')
    normal=d.styles['Normal'].paragraph_format
    normal.line_spacing=1.12;normal.space_after=Pt(5)
    for name in ['Heading 1','Heading 2']:
        d.styles[name].paragraph_format.space_before=Pt(10)
        d.styles[name].paragraph_format.space_after=Pt(7)
    for style in d.styles:
        for border in list(style.element.iter(qn('w:pBdr'))):
            border.getparent().remove(border)
    d.core_properties.title=source.read_text(encoding='utf-8').splitlines()[0][2:]
    d.core_properties.author='AI WorkHub'
    lines=source.read_text(encoding='utf-8').splitlines()
    i=0
    while i<len(lines):
        text=lines[i].strip()
        if not text: i+=1;continue
        if text=='===':i+=1;continue
        if text.startswith('# '):d.add_paragraph(text[2:],'Title')
        elif text.startswith('## '):d.add_paragraph(text[3:],'Heading 1')
        elif '｜' in text:
            rows=[]
            while i<len(lines) and '｜' in lines[i]:
                rows.append(lines[i].split('｜'));i+=1
            n=len(rows[0]);t=d.add_table(rows=0,cols=n)
            t.autofit=False
            widths=([2.5,1.5,3] if source.stem.startswith('03') else [1.5,2.35,3.15]) if n==3 else [3.3,3.7]
            for col,w in zip(t.columns,widths):col.width=Inches(w)
            for index,vals in enumerate(rows):
                row=t.add_row()
                for j,(cell,val) in enumerate(zip(row.cells,vals)):
                    cell.width=Inches(widths[j]);p=cell.paragraphs[0];p.paragraph_format.space_after=Pt(3);p.paragraph_format.space_before=Pt(3)
                    run=p.add_run(val);run.font.size=Pt(10)
                    if index==0:
                        p.paragraph_format.keep_with_next=True
                        run.bold=True
                        shade=OxmlElement('w:shd');shade.set(qn('w:fill'),'E9EEF2');cell._tc.get_or_add_tcPr().append(shade)
                if index==0:
                    repeat=OxmlElement('w:tblHeader');row._tr.get_or_add_trPr().append(repeat)
                no_split=OxmlElement('w:cantSplit');row._tr.get_or_add_trPr().append(no_split)
            d.add_paragraph()
            continue
        else:d.add_paragraph(text)
        i+=1
    p=sec.footer.paragraphs[0];p.alignment=2
    run=p.add_run('AI WorkHub    ');run.font.size=Pt(9)
    field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE');p._p.append(field)
    out=ROOT/(source.stem+'.docx');d.save(out);print(out)
