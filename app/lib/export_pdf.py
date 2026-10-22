import io
import json
import os
import sys
from html import escape
from pathlib import Path
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Flowable, KeepTogether

ORANGE = colors.HexColor('#F46B21')
BLUE = colors.HexColor('#3D7FCD')
INK = colors.HexColor('#253B59')
MUTED = colors.HexColor('#7C8DA5')
LINE = colors.HexColor('#D4E0F0')
PALE = colors.HexColor('#F3F7FC')


class Banner(Flowable):
    def __init__(self, width, paragraphs):
        super().__init__()
        self.width, self.paragraphs = width, paragraphs
        self.hAlign = 'CENTER'
        self.sizes = [p.wrap(width - 28, 1000)[1] for p in paragraphs]
        self.height = sum(self.sizes) + 34

    def draw(self):
        self.canv.setFillColor(ORANGE)
        self.canv.roundRect(0, 0, self.width, self.height, 10, fill=1, stroke=0)
        y = self.height - 14
        for paragraph, height in zip(self.paragraphs, self.sizes):
            y -= height
            paragraph.drawOn(self.canv, 14, y)
            y -= 3


class Section(Flowable):
    def __init__(self, title, subtitle, font):
        super().__init__()
        self.title, self.subtitle, self.font = title, subtitle, font
        self.width, self.hAlign = A4[0] - 66, 'CENTER'
        self.height = 39

    def draw(self):
        c = self.canv
        c.setFillColor(ORANGE)
        c.rect(0, 7, 3, 25, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont(self.font, 12)
        c.drawString(10, 21, self.title)
        c.setFillColor(MUTED)
        c.setFont('Helvetica', 6.5)
        c.drawString(10, 10, self.subtitle)


class ParallelTables(Flowable):
    """Let both columns continue independently, retaining each table's headers."""
    def __init__(self, left, right, width, gap=10):
        super().__init__()
        self.left, self.right, self.width, self.gap = left, right, width, gap
        self.hAlign = 'LEFT'

    def wrap(self, avail_width, avail_height):
        half = (self.width - self.gap) / 2
        self.sizes = [t.wrapOn(self.canv, half, avail_height)[1] if t else 0 for t in (self.left, self.right)]
        self.height = max(self.sizes)
        return self.width, self.height

    def split(self, avail_width, avail_height):
        half = (self.width - self.gap) / 2
        first, rest = [], []
        for table in (self.left, self.right):
            if table is None:
                first.append(None)
                rest.append(None)
            elif table.wrapOn(self.canv, half, avail_height)[1] <= avail_height:
                first.append(table)
                rest.append(None)
            else:
                pieces = table.splitOn(self.canv, half, avail_height)
                if len(pieces) != 2:
                    return []
                first.append(pieces[0])
                rest.append(pieces[1])
        if not any(rest):
            return [self]
        return [ParallelTables(*first, self.width, self.gap), ParallelTables(*rest, self.width, self.gap)]

    def draw(self):
        half = (self.width - self.gap) / 2
        for x, table, height in zip((0, half + self.gap), (self.left, self.right), self.sizes):
            if table:
                table.drawOn(self.canv, x, self.height - height)


class PhaseCard(Flowable):
    """A framed stage that can break within its body, with a labelled continuation."""
    def __init__(self, width, header, blocks, accent, preamble_count=0, continued=False, section=None, keep_tail=False):
        super().__init__()
        self.width, self.header_factory, self.blocks, self.accent = width, header, blocks, accent
        self.preamble_count, self.continued = preamble_count, continued
        self.section = section
        self.keep_tail = keep_tail
        self.hAlign = 'CENTER'

    def wrap(self, avail_width, avail_height):
        inner = self.width - 20
        self.header = self.header_factory(self.continued)
        self.header_height = self.header.wrapOn(self.canv, inner, avail_height)[1]
        self.sizes = [b.wrapOn(self.canv, inner, avail_height)[1] for b in self.blocks]
        self.section_height = self.section.wrapOn(self.canv, self.width, avail_height)[1] if self.section else 0
        self.card_height = 16 + self.header_height + 8 + sum(self.sizes)
        self.height = self.card_height + self.section_height
        return self.width, self.height

    def split(self, avail_width, avail_height):
        self.wrap(avail_width, avail_height)
        remaining = avail_height - self.section_height - 16 - self.header_height - 8
        before = []
        for i, (block, height) in enumerate(zip(self.blocks, self.sizes)):
            if height <= remaining:
                before.append(block)
                remaining -= height
                continue
            # Keep the stage heading, source and objective with actual teaching content.
            if i < self.preamble_count:
                return []
            pieces = block.splitOn(self.canv, self.width - 20, remaining) if remaining > 0 else []
            if pieces and pieces[0].wrapOn(self.canv, self.width - 20, remaining)[1] <= remaining:
                before.append(pieces[0])
                after = pieces[1:] + self.blocks[i + 1:]
            else:
                after = self.blocks[i:]
            if len(before) <= self.preamble_count:
                return []
            while before and isinstance(before[-1], Spacer):
                before.pop()
            while after and isinstance(after[0], Spacer):
                after = after[1:]
            # Keep a final arrangement note with the preceding table's last row.
            if self.keep_tail and len(after) == 1 and after[0] is self.blocks[-1] and before:
                previous = before[-1]
                if isinstance(previous, (Table, ParallelTables)):
                    height = previous.wrapOn(self.canv, self.width - 20, avail_height)[1]
                    tail_parts = previous.splitOn(self.canv, self.width - 20, height - 1)
                    if len(tail_parts) == 2:
                        before[-1] = tail_parts[0]
                        after = [tail_parts[1], Spacer(1, 8)] + after
            return [PhaseCard(self.width, self.header_factory, before, self.accent, continued=self.continued, section=self.section),
                    PhaseCard(self.width, self.header_factory, after, self.accent, continued=True, keep_tail=self.keep_tail)]
        return [self]

    def draw(self):
        c = self.canv
        c.saveState()
        if self.section:
            self.section.drawOn(c, 0, self.card_height)
        c.setStrokeColor(LINE)
        c.setLineWidth(.6)
        c.rect(0, 0, self.width, self.card_height, stroke=1, fill=0)
        c.setStrokeColor(self.accent)
        c.setLineWidth(2.3)
        c.line(0, 0, 0, self.card_height)
        y = self.card_height - 8 - self.header_height
        self.header.drawOn(c, 10, y)
        y -= 8
        for block, height in zip(self.blocks, self.sizes):
            y -= height
            block.drawOn(c, 10, y)
        c.restoreState()


def export_pdf(plan):
    font_path = Path(os.environ.get('PLANNER_FONT', r'C:\Windows\Fonts\msyh.ttc'))
    if font_path.exists():
        pdfmetrics.registerFont(TTFont('Chinese', str(font_path), subfontIndex=0))
        bold_path = font_path.with_name('msyhbd.ttc')
        pdfmetrics.registerFont(TTFont('ChineseBold', str(bold_path if bold_path.exists() else font_path), subfontIndex=0))
        font, bold = 'Chinese', 'ChineseBold'
    else:
        pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
        font = bold = 'STSong-Light'
    styles = {
        'title': ParagraphStyle('title', fontName=bold, fontSize=20, leading=29, textColor=colors.white, wordWrap='CJK'),
        'subtitle': ParagraphStyle('subtitle', fontName=bold, fontSize=10.5, leading=17, textColor=colors.white, wordWrap='CJK'),
        'hero_meta': ParagraphStyle('hero_meta', fontName=font, fontSize=8, leading=13, textColor=colors.HexColor('#FFF4E7'), wordWrap='CJK'),
        'body': ParagraphStyle('body', fontName=font, fontSize=9.3, leading=16, textColor=INK, wordWrap='CJK', spaceAfter=7),
        'cell': ParagraphStyle('cell', fontName=font, fontSize=8.6, leading=13.4, textColor=INK, wordWrap='CJK', splitLongWords=True),
        'task': ParagraphStyle('task', fontName=bold, fontSize=9, leading=14, textColor=INK, wordWrap='CJK', splitLongWords=True),
        'date': ParagraphStyle('date', fontName=bold, fontSize=8.2, leading=13.4, textColor=INK, wordWrap='CJK'),
        'th': ParagraphStyle('th', fontName=bold, fontSize=8.8, leading=14, textColor=colors.white, wordWrap='CJK'),
        'label': ParagraphStyle('label', fontName=font, fontSize=7, leading=12, textColor=MUTED, wordWrap='CJK'),
        'value': ParagraphStyle('value', fontName=bold, fontSize=10.5, leading=16, textColor=INK, wordWrap='CJK'),
        'small': ParagraphStyle('small', fontName=font, fontSize=7.5, leading=12, textColor=MUTED, wordWrap='CJK'),
        'phase_title': ParagraphStyle('phase_title', fontName=bold, fontSize=11, leading=17, textColor=INK, wordWrap='CJK'),
        'phase_time': ParagraphStyle('phase_time', fontName=bold, fontSize=8.2, leading=13, textColor=BLUE, alignment=2, wordWrap='CJK'),
        'route_cell': ParagraphStyle('route_cell', fontName=font, fontSize=8, leading=12.2, textColor=INK, wordWrap='CJK'),
        'route_task': ParagraphStyle('route_task', fontName=bold, fontSize=8.6, leading=13, textColor=INK, wordWrap='CJK'),
    }

    def para(value, style='body'):
        value = str(value or '').replace('\u2013', '-').replace('\u2014', '-').replace('\u2011', '-')
        return Paragraph(escape(value).replace('\n', '<br/>'), styles[style])

    def content_table(headers, rows, widths):
        cells = [[para(h, 'th') for h in headers]] + [[para(v, 'task' if i == 0 else 'cell') for i, v in enumerate(row)] for row in rows]
        t = Table(cells, colWidths=widths, repeatRows=1, splitByRow=1, splitInRow=1)
        t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), BLUE),
                              ('ROWBACKGROUNDS', (0, 1), (-1, -1), [PALE, colors.white]),
                              ('GRID', (0, 0), (-1, -1), .45, LINE), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                              ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                              ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
        if headers[0] == '训练与掌握要求':
            t.setStyle(TableStyle([('SPAN', (0, 0), (-1, 0))]))
        return t

    def phase_card(phase, index, card_width):
        inner = card_width - 20
        when = phase.get('timeLabel') or (phase['start'][:7] + ' · 目标月份' if phase['kind'] == 'goal' else phase['start'] + ' 至 ' + phase['end'])
        def header(continued):
            title = f"{index + 1}. {phase['title']}" + ('（续）' if continued else '')
            table = Table([[para(title, 'phase_title'), para(when, 'phase_time')]], colWidths=[inner * .58, inner * .42])
            table.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0),
                                   ('RIGHTPADDING', (0, 0), (-1, -1), 0), ('TOPPADDING', (0, 0), (-1, -1), 0),
                                   ('BOTTOMPADDING', (0, 0), (-1, -1), 0)]))
            return table
        parts = [para(phase.get('sourceLabel', ''), 'small'), Spacer(1, 8), para('阶段目标：' + phase['objective']), Spacer(1, 8)]
        body_parts = []
        if phase['kind'] in ('regular', 'manual'):
            half = (inner - 10) / 2
            left = content_table(['学习模块', '内容'], [[r['label'], r['content']] for r in phase['modules']], [half * .27, half * .73])
            right = content_table(['训练与掌握要求', '内容'], [[r['label'], r['content']] for r in phase['checks']], [half * .27, half * .73])
            if max(left.wrap(half, doc.height)[1], right.wrap(half, doc.height)[1]) < doc.height - 150:
                body_parts = [ParallelTables(left, right, inner)]
            else:
                # Exceptionally long course text flows in full-width tables.
                body_parts = [content_table(['学习模块', '内容'], [[r['label'], r['content']] for r in phase['modules']], [inner * .2, inner * .8]), Spacer(1, 8),
                              content_table(['训练与掌握要求', '内容'], [[r['label'], r['content']] for r in phase['checks']], [inner * .2, inner * .8])]
        elif phase['kind'] == 'camp':
            if phase['days']:
                body_parts.append(content_table(['天数', '学习主题', '教学内容与安排'],
                    [[f"Day {d['day']:02d}", d['topic'], d['content']] for d in phase['days']], [inner * .12, inner * .24, inner * .64]))
            else:
                body_parts.append(para('本版本逐日大纲待补充。', 'small'))
            for item in phase['checks']:
                body_parts.append(para(item['label'] + '：' + item['content'], 'cell'))
        elif phase['kind'] == 'goal':
            for item in phase['modules']:
                body_parts.append(para(item['label'] + '：' + item['content']))
            body_parts.append(content_table(['训练环节', '时间', '题源 / 材料', '训练方式与产出'],
                [[r['round'], r['time'], r['resources'], r['action']] for r in phase['training']], [inner * .15, inner * .19, inner * .28, inner * .38]))
        for part in body_parts:
            parts.extend([part, Spacer(1, 8)])
        if phase['notes']:
            parts.append(para('安排说明：' + '\n'.join(phase['notes']), 'small'))
        while parts and isinstance(parts[-1], Spacer):
            parts.pop()
        return PhaseCard(card_width, header, parts, ORANGE if phase['kind'] == 'goal' else BLUE, preamble_count=4, keep_tail=bool(phase['notes']))

    s, c = plan['studentSnapshot'], plan['conditions']
    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=A4, rightMargin=33, leftMargin=33, topMargin=51, bottomMargin=40,
                            title=s['name'] + ' · C++信奥学习规划书', author=plan.get('updatedBy') or '学习规划工作台',
                            subject='课程安排、阶段目标与学习建议')
    width = A4[0] - 66
    story = [Banner(width, [para('C++ 信奥学习规划书', 'title'),
                para(f"{s['name']} · {s['grade']}  |  近期目标：{c['goal']}", 'subtitle'),
                para(f"周期：{c['start']} 至 {c['end']}  ·  班级：{s['className']}", 'hero_meta')]), Spacer(1, 10)]
    camp_count = sum(r.get('kind') == 'camp' for r in plan['rows'])
    cards = [
        ('学习起点', f"U{s['unit']} · 已完成第{s['lesson']}课", s.get('passed') or '已有等级待记录'),
        ('近期目标', c['goal'], ('安排场次：' + c['recentMonth']) if c.get('recentMonth') else '本周期未安排，待调整'),
        ('学习安排', f"{len(plan['rows'])}个阶段 · {camp_count}次集训", f"{plan.get('lessonCount', 0)}次常规课 · 每周一课"),
        ('课程体系', 'AC班 U1-U8' if 'AC' in s['curriculum'] else s['curriculum'], '寒暑假常规课照常进行'),
    ]
    card_width = (width - 18) / 4
    card_cells = []
    for i, (label, value, note) in enumerate(cards):
        card = Table([[para(label, 'label')], [para(value, 'value')], [para(note, 'small')]], colWidths=[card_width])
        card.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), PALE), ('BOX', (0, 0), (-1, -1), .5, LINE),
                    ('LINEABOVE', (0, 0), (-1, 0), 1.4, BLUE), ('LEFTPADDING', (0, 0), (-1, -1), 7),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 7), ('TOPPADDING', (0, 0), (-1, -1), 3),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 3)]))
        if i:
            card_cells.append('')
        card_cells.append(card)
    summary = Table([card_cells], colWidths=[card_width, 6, card_width, 6, card_width, 6, card_width])
    summary.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0),
                                ('RIGHTPADDING', (0, 0), (-1, -1), 0), ('TOPPADDING', (0, 0), (-1, -1), 0),
                                ('BOTTOMPADDING', (0, 0), (-1, -1), 0)]))
    story.extend([summary, Spacer(1, 6), Section('一、整体路线图', 'ROADMAP', bold)])
    data = [[para(x, 'th') for x in ['时间', '任务', '核心知识点', '掌握重点与编程思维']]]
    for row in plan['rows']:
        when = row['start'].replace('-', '.')
        if row.get('kind') == 'goal':
            when = row['start'][:7].replace('-', '.') + '\n（拟定月份）'
        elif row['end'] != row['start']:
            when += '\n至 ' + row['end'].replace('-', '.')
        when = row.get('timeLabel') or when
        data.append([para(when, 'date'), para(row['task'], 'route_task'), para(row['knowledge'], 'route_cell'), para(row['milestone'], 'route_cell')])
    col_widths = [width * v for v in [.15, .21, .34, .30]]
    row_heights = [max(cell.wrap(col_widths[i] - 12, doc.height)[1] for i, cell in enumerate(row)) + 15 for row in data]
    oversized = any(height > doc.height - row_heights[0] - 12 for height in row_heights[1:])
    table = Table(data, colWidths=col_widths, repeatRows=1, splitByRow=1, splitInRow=int(oversized))
    table_style = [('BACKGROUND', (0, 0), (-1, 0), BLUE),
                   ('ROWBACKGROUNDS', (0, 1), (-1, -1), [PALE, colors.white]),
                   ('GRID', (0, 0), (-1, -1), .45, LINE), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                   ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                   ('TOPPADDING', (0, 0), (-1, -1), 7.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 7.5)]
    for index, row in enumerate(plan['rows'], 1):
        if row.get('kind') in ('camp', 'goal'):
            table_style.append(('BACKGROUND', (0, index), (0, index), colors.HexColor('#FFF1E5' if row['kind'] == 'camp' else '#EAF2FF')))
    table.setStyle(TableStyle(table_style))
    story.extend([table, Spacer(1, 7), para('说明：考级为拟安排，需补齐缺口并经测评确认；后续等级以前阶段完成为前提。未公布日期的场次以正式通知为准，集训以实际参加为准。', 'small')])
    guidance = plan['guidance']
    guidance_table = Table([[para(label, 'task'), para(guidance[key], 'cell')] for label, key in [('学习重点', 'focus'), ('课后任务', 'homework'), ('家长配合', 'family')]], colWidths=[65, width - 65])
    guidance_table.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#EEF5FF')),
                                       ('BOX', (0, 0), (-1, -1), .5, LINE), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                                       ('LEFTPADDING', (0, 0), (-1, -1), 9), ('RIGHTPADDING', (0, 0), (-1, -1), 9),
                                       ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7)]))
    story.append(KeepTogether([Section('二、本阶段学习建议', 'LEARNING GUIDANCE', bold), guidance_table]))
    for i, phase in enumerate(plan['phases']):
        card = phase_card(phase, i, width)
        if i == 0:
            card.section = Section('三、阶段详解', 'PHASES', bold)
        else:
            story.append(Spacer(1, 12))
        story.append(card)
    story.extend([Spacer(1, 12), para(f"制定老师：{plan.get('updatedBy') or '待填写'}    ·    更新日期：{plan.get('updatedAt', '')[:10]}", 'small')])

    def page_frame(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(ORANGE)
        canvas.setLineWidth(.8)
        canvas.line(33, A4[1] - 40, A4[0] - 33, A4[1] - 40)
        canvas.setFont(bold, 8.3)
        canvas.setFillColor(ORANGE)
        label = s['name'] + ' · C++ 信奥学习规划书'
        if len(label) > 45:
            label = label[:44] + '…'
        canvas.drawString(33, A4[1] - 31, label)
        canvas.setFont(font, 7)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(A4[0] - 33, A4[1] - 31, plan.get('updatedAt', '')[:10])
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(.5)
        canvas.line(33, 30, A4[0] - 33, 30)
        canvas.setFont(font, 7)
        canvas.drawString(33, 19, 'C++ 信奥学习规划书 · ' + str(plan.get('exportVersion', '学习规划')))
        canvas.drawRightString(A4[0] - 33, 19, f'第 {document.page} 页')
        canvas.restoreState()

    doc.build(story, onFirstPage=page_frame, onLaterPages=page_frame)
    return output.getvalue()


if __name__ == '__main__':
    data = json.loads(sys.stdin.buffer.read().decode('utf-8'))
    sys.stdout.buffer.write(export_pdf(data))
