"""Exercise exported pages with synthetic data; never open the application database."""
import copy
import io
import sys
import unittest
from pathlib import Path

import pdfplumber

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib'))
from export_pdf import export_pdf


def phase(number, kind='regular'):
    return dict(title=f'U{number}单元：课程主题', kind=kind, start='2026-10-24', end='2027-01-09',
                sourceLabel=f'U{number} · 第1-12课', objective='理解课程知识，能够独立解释并完成相应程序。',
                modules=[dict(label=label, content='练习分支判断、循环、数组处理，解释程序运行过程。' * 3)
                         for label in ['程序设计', '综合应用', '复习总结']],
                checks=[dict(label=label, content='在ACGO完成指定练习，检查边界条件并说明解题过程。' * 3)
                        for label in ['训练任务', '编程思维', '掌握标准']], notes=[])


def plan(phases):
    return dict(studentSnapshot=dict(name='分页测试学员', grade='五年级', className='测试班',
                                     curriculum='AC班', unit=1, lesson=12, passed='待测评'),
                conditions=dict(start='2026-10-24', end='2027-09-30', goal='GESP 1级'),
                rows=[dict(start='2026-10-24', end='2027-01-09', kind='regular', task='课程主题',
                           knowledge='分支、循环与数组', milestone='理解执行顺序与边界条件')],
                guidance=dict(focus='巩固本单元知识。', homework='在ACGO完成课后练习。', family='协助安排练习时间。'),
                phases=phases, lessonCount=20, updatedBy='测试老师', updatedAt='2026-10-22')


def open_report(data):
    return pdfplumber.open(io.BytesIO(export_pdf(data)))


class PdfPaginationTests(unittest.TestCase):
    def assert_body_in_bounds(self, pdf):
        for page in pdf.pages:
            body = [c for c in page.chars if 50 < c['top'] < 800]
            self.assertTrue(body)
            self.assertTrue(all(30 <= c['x0'] and c['x1'] <= 565 for c in body))
            self.assertLess(max(c['bottom'] for c in body), 797)

    def test_regular_stages_fill_available_space_and_repeat_headings(self):
        # A stage that fits a fresh page must still use the previous page's spare space.
        data = plan([phase(1), phase(2), phase(3)])
        with open_report(data) as pdf:
            texts = [p.extract_text() for p in pdf.pages]
            self.assertIn('1. U1单元', texts[0])
            self.assertIn('2. U2单元', texts[1])
            self.assertIn('3. U3单元', texts[1])
            self.assertIn('（续）', texts[1])
            self.assertIn('学习模块', texts[1])
            self.assertIn('训练与掌握要求', texts[1])
            for page in pdf.pages[:-1]:
                body = [c for c in page.chars if 50 < c['top'] < 800]
                self.assertGreater(max(c['bottom'] for c in body), 680)
            self.assert_body_in_bounds(pdf)

    def test_long_camp_and_exam_keep_all_content_across_pages(self):
        camp = phase(4, 'camp')
        camp['title'] = 'D02寒假集训'
        camp['days'] = [dict(day=n, topic=f'主题{n:02d}', content=(f'第{n:02d}天教学内容：' + '解释算法并进行程序练习。' * 10))
                        for n in range(1, 11)]
        exam = phase(5, 'goal')
        exam['title'] = '参加GESP考级'
        exam['training'] = [dict(round=f'轮次{n}', time='考前安排', resources='老师指定材料',
                                 action=f'训练{n}开始' + '分析知识点、检查代码并复盘。' * 100 + f'训练{n}结束')
                            for n in range(1, 4)]
        data = plan([phase(1), camp, exam])
        original = copy.deepcopy(data)
        with open_report(data) as pdf:
            texts = [p.extract_text() for p in pdf.pages]
            text = ''.join(texts).replace('\n', '').replace(' ', '')
            for n in range(1, 11):
                self.assertEqual(text.count(f'主题{n:02d}'), 1)
            for n in range(1, 4):
                self.assertEqual(text.count(f'训练{n}开始'), 1)
                self.assertEqual(text.count(f'训练{n}结束'), 1)
            # Page headers may interrupt a sentence in extracted text, but no letters may disappear.
            self.assertEqual(text.count('析'), 300)
            self.assertEqual(text.count('盘'), 300)
            self.assertTrue(any('D02寒假集训（续）' in t and '教学内容与安排' in t for t in texts))
            self.assertTrue(any('参加GESP考级（续）' in t and '训练方式与产出' in t for t in texts))
            self.assert_body_in_bounds(pdf)
        self.assertEqual(data, original)


if __name__ == '__main__':
    unittest.main()
