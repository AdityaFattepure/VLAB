#!/usr/bin/env python3
"""Build the 10-slide VLab project review deck from the repo screenshots."""

from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "VLab-Project-Review.pptx"
SHOTS = ROOT / "docs" / "screenshots"

# Palette taken from the VLab UI.
NAVY = RGBColor(15, 34, 58)
NAVY_SOFT = RGBColor(27, 52, 82)
TEAL = RGBColor(13, 116, 110)
TEAL_LIGHT = RGBColor(224, 244, 241)
CYAN = RGBColor(6, 182, 212)
INK = RGBColor(31, 41, 55)
MUTED = RGBColor(100, 116, 139)
LINE = RGBColor(214, 225, 236)
PAPER = RGBColor(247, 250, 253)
WHITE = RGBColor(255, 255, 255)
AMBER = RGBColor(217, 119, 6)
AMBER_LIGHT = RGBColor(255, 247, 232)
RED = RGBColor(185, 28, 28)
RED_LIGHT = RGBColor(254, 242, 242)
FONT = "Segoe UI"
MONO = "Consolas"

SW = Inches(13.333)
SH = Inches(7.5)


def solid(shape, color):
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()


def textbox(slide, text, x, y, w, h, size=16, color=INK, bold=False,
            font=FONT, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
            line_spacing=1.05, margins=(0, 0, 0, 0)):
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left, tf.margin_right, tf.margin_top, tf.margin_bottom = margins
    lines = text.split("\n")
    for index, line in enumerate(lines):
        p = tf.paragraphs[0] if index == 0 else tf.add_paragraph()
        p.text = line
        p.alignment = align
        p.line_spacing = line_spacing
        p.space_after = Pt(0)
        p.space_before = Pt(0)
        for run in p.runs:
            run.font.name = font
            run.font.size = Pt(size)
            run.font.bold = bold
            run.font.color.rgb = color
    return box


def card(slide, x, y, w, h, fill=WHITE, line=LINE, radius=True):
    shape_type = MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE
    shape = slide.shapes.add_shape(shape_type, x, y, w, h)
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.color.rgb = line
    shape.line.width = Pt(1)
    if radius:
        shape.adjustments[0] = 0.08
    return shape


def pill(slide, text, x, y, w, fill=TEAL_LIGHT, color=TEAL, size=10):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, Inches(0.32))
    solid(shape, fill)
    shape.adjustments[0] = 0.5
    tf = shape.text_frame
    tf.margin_left = Inches(0.08)
    tf.margin_right = Inches(0.08)
    tf.margin_top = 0
    tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.text = text
    p.alignment = PP_ALIGN.CENTER
    for run in p.runs:
        run.font.name = FONT
        run.font.size = Pt(size)
        run.font.bold = True
        run.font.color.rgb = color


def add_logo(slide, x=Inches(0.55), y=Inches(0.38)):
    mark = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(0.42), Inches(0.42))
    solid(mark, NAVY)
    mark.adjustments[0] = 0.18
    tf = mark.text_frame
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.text = "V"
    p.alignment = PP_ALIGN.CENTER
    for run in p.runs:
        run.font.name = FONT
        run.font.size = Pt(20)
        run.font.bold = True
        run.font.color.rgb = WHITE
def header(slide, number, kicker, title):
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SW, Inches(0.075))
    solid(bar, CYAN)
    add_logo(slide)
    textbox(slide, kicker.upper(), Inches(1.12), Inches(0.38), Inches(6.2), Inches(0.22), size=9, color=TEAL, bold=True)
    textbox(slide, title, Inches(1.12), Inches(0.62), Inches(10.9), Inches(0.55), size=28, color=NAVY, bold=True)
    textbox(slide, "PROJECT REVIEW · 2026", Inches(10.3), Inches(0.42), Inches(2.45), Inches(0.22), size=8, color=MUTED, align=PP_ALIGN.RIGHT)
    textbox(slide, f"{number:02d} / 10", Inches(11.9), Inches(7.13), Inches(0.9), Inches(0.2), size=8, color=MUTED, align=PP_ALIGN.RIGHT)
    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(1.45), Inches(1.28), Inches(11.25), Inches(0.012))
    solid(line, LINE)


def footer(slide, text="VLab  ·  Container-based virtual lab"):
    textbox(slide, text, Inches(0.6), Inches(7.13), Inches(6.0), Inches(0.2), size=8, color=MUTED)


def add_picture_contain(slide, path, x, y, w, h):
    iw, ih = Image.open(path).size
    scale = min(w / iw, h / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    left = int(x + (w - nw) / 2)
    top = int(y + (h - nh) / 2)
    return slide.shapes.add_picture(str(path), left, top, width=nw, height=nh)


def browser_frame(slide, image_path, x, y, w, h, caption=None, caption_color=MUTED):
    shadow = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x + Inches(0.06), y + Inches(0.08), w, h)
    solid(shadow, RGBColor(231, 238, 246))
    shadow.adjustments[0] = 0.04
    frame = card(slide, x, y, w, h, fill=WHITE, line=LINE)
    frame.adjustments[0] = 0.035
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x + Inches(0.02), y + Inches(0.02), w - Inches(0.04), Inches(0.25))
    solid(bar, RGBColor(235, 241, 247))
    for i, color in enumerate((RGBColor(248, 113, 113), RGBColor(251, 191, 36), RGBColor(52, 211, 153))):
        dot = slide.shapes.add_shape(MSO_SHAPE.OVAL, x + Inches(0.14 + i * 0.15), y + Inches(0.10), Inches(0.07), Inches(0.07))
        solid(dot, color)
    add_picture_contain(slide, image_path, x + Inches(0.05), y + Inches(0.33), w - Inches(0.10), h - Inches(0.39))
    if caption:
        textbox(slide, caption, x, y + h + Inches(0.09), w, Inches(0.22), size=9, color=caption_color, align=PP_ALIGN.CENTER)


def bullet_list(slide, items, x, y, w, h, size=15, color=INK, bullet_color=TEAL, gap=10):
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    for index, item in enumerate(items):
        p = tf.paragraphs[0] if index == 0 else tf.add_paragraph()
        p.text = ""
        p.space_after = Pt(gap)
        p.line_spacing = 1.06
        run = p.add_run()
        run.text = "•  "
        run.font.name = FONT
        run.font.size = Pt(size)
        run.font.bold = True
        run.font.color.rgb = bullet_color
        run = p.add_run()
        run.text = item
        run.font.name = FONT
        run.font.size = Pt(size)
        run.font.color.rgb = color
    return box


def numbered_steps(slide, steps, x, y, w, step_gap=0.68, size=14):
    for index, (title, detail) in enumerate(steps):
        top = y + Inches(index * step_gap)
        circle = slide.shapes.add_shape(MSO_SHAPE.OVAL, x, top, Inches(0.34), Inches(0.34))
        solid(circle, TEAL)
        tf = circle.text_frame
        tf.margin_left = 0
        tf.margin_right = 0
        tf.margin_top = 0
        tf.margin_bottom = 0
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = tf.paragraphs[0]
        p.text = str(index + 1)
        p.alignment = PP_ALIGN.CENTER
        for run in p.runs:
            run.font.name = FONT
            run.font.size = Pt(11)
            run.font.bold = True
            run.font.color.rgb = WHITE
        textbox(slide, title, x + Inches(0.48), top - Inches(0.01), w - Inches(0.48), Inches(0.23), size=size, color=NAVY, bold=True)
        textbox(slide, detail, x + Inches(0.48), top + Inches(0.24), w - Inches(0.48), Inches(0.35), size=10, color=MUTED, line_spacing=1.0)


def code_strip(slide, lines, x, y, w, h):
    panel = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
    solid(panel, NAVY)
    panel.adjustments[0] = 0.08
    textbox(slide, lines, x + Inches(0.16), y + Inches(0.10), w - Inches(0.32), h - Inches(0.18),
            size=10, color=RGBColor(209, 250, 229), font=MONO, line_spacing=1.12)


def notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def main():
    prs = Presentation()
    prs.slide_width = SW
    prs.slide_height = SH
    blank = prs.slide_layouts[6]

    # ---------------------------------------------------------------- 1. Title
    slide = prs.slides.add_slide(blank)
    bg = slide.background.fill
    bg.solid()
    bg.fore_color.rgb = NAVY
    # Decorative blocks.
    block = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(8.2), Inches(-1.2), Inches(6.2), Inches(9.6))
    solid(block, NAVY_SOFT)
    block.adjustments[0] = 0.16
    accent = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.7), Inches(0.72), Inches(0.72), Inches(0.08))
    solid(accent, CYAN)

    textbox(slide, "CBAD MINI PROJECT  ·  PROJECT REVIEW", Inches(0.7), Inches(0.98), Inches(6.6), Inches(0.24), size=10, color=RGBColor(125, 211, 252), bold=True)
    textbox(slide, "VLab", Inches(0.66), Inches(1.34), Inches(5.2), Inches(1.0), size=62, color=WHITE, bold=True)
    textbox(slide, "A container-based virtual lab\nwith live teacher visibility", Inches(0.7), Inches(2.45), Inches(5.6), Inches(1.0), size=26, color=RGBColor(226, 238, 248), line_spacing=1.05)
    textbox(slide, "One disposable Docker sandbox per student.\nOne live view of the whole class.", Inches(0.7), Inches(3.62), Inches(5.6), Inches(0.8), size=14, color=RGBColor(148, 178, 204), line_spacing=1.2)

    pill(slide, "Node 22 + Express", Inches(0.7), Inches(4.72), Inches(1.7), fill=RGBColor(30, 58, 89), color=RGBColor(165, 243, 252))
    pill(slide, "React + Vite", Inches(2.5), Inches(4.72), Inches(1.4), fill=RGBColor(30, 58, 89), color=RGBColor(165, 243, 252))
    pill(slide, "Docker-in-Docker", Inches(4.0), Inches(4.72), Inches(1.8), fill=RGBColor(30, 58, 89), color=RGBColor(165, 243, 252))

    textbox(slide, "http://localhost:5173", Inches(0.7), Inches(5.68), Inches(4.0), Inches(0.3), size=12, color=RGBColor(125, 211, 252), font=MONO)
    textbox(slide, "Project review  ·  2026", Inches(0.7), Inches(6.55), Inches(4.0), Inches(0.3), size=10, color=RGBColor(148, 178, 204))

    browser_frame(slide, SHOTS / "login.png", Inches(7.35), Inches(1.05), Inches(5.3), Inches(4.9), caption="Sign in as a teacher or student", caption_color=RGBColor(148, 178, 204))
    notes(slide, "VLab is a classroom-first Docker lab. The key idea is one disposable container per student plus a teacher view that shows real state, not screenshots.")

    # ---------------------------------------------------------------- 2. Problem
    slide = prs.slides.add_slide(blank)
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = PAPER
    header(slide, 2, "Why this exists", "Docker labs break before the learning starts")
    footer(slide)
    problems = [
        ("01", "Setup drift", "Docker Desktop, ports, images, and permissions differ on every laptop. One broken install stalls the practical."),
        ("02", "No live visibility", "The teacher cannot see who is running commands, who is stuck, or which task is failing right now."),
        ("03", "Manual evidence", "End-of-lab screenshots are easy to fake, slow to collect, and hard to review consistently."),
    ]
    for i, (num, title, body) in enumerate(problems):
        x = Inches(0.65 + i * 4.08)
        card(slide, x, Inches(1.7), Inches(3.78), Inches(2.55), fill=WHITE)
        textbox(slide, num, x + Inches(0.25), Inches(1.9), Inches(0.55), Inches(0.35), size=12, color=CYAN, bold=True, font=MONO)
        textbox(slide, title, x + Inches(0.25), Inches(2.28), Inches(3.2), Inches(0.35), size=18, color=NAVY, bold=True)
        textbox(slide, body, x + Inches(0.25), Inches(2.76), Inches(3.18), Inches(1.1), size=12, color=MUTED, line_spacing=1.1)

    callout = card(slide, Inches(0.65), Inches(4.82), Inches(12.0), Inches(1.25), fill=TEAL_LIGHT, line=RGBColor(167, 224, 216))
    textbox(slide, "VLab gives every student a disposable container\nand gives the teacher one live view of the class.", Inches(0.95), Inches(5.05), Inches(11.3), Inches(0.8), size=22, color=TEAL, bold=True, line_spacing=1.08)
    notes(slide, "Frame the problem around classroom friction, not just Docker. The teacher needs visibility and trustworthy evidence.")

    # ---------------------------------------------------------------- 3. Solution
    slide = prs.slides.add_slide(blank)
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = PAPER
    header(slide, 3, "The idea", "A class workflow around a disposable sandbox")
    footer(slide)
    pillars = [
        ("Isolated by default", "Each student gets a private Docker-in-Docker container. Their work never touches the host."),
        ("Everything in the browser", "Terminal, file editor, and read-only Docker inventory in one lab workspace."),
        ("Checks inspect state", "Tasks verify files and containers, not keystrokes, so completion is honest and repeatable."),
        ("Teacher in the loop", "Live roster, task progress, last command, evidence review, and read-only inspection."),
    ]
    for i, (title, body) in enumerate(pillars):
        y = Inches(1.62 + i * 1.17)
        num = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(0.68), y, Inches(0.38), Inches(0.38))
        solid(num, TEAL)
        tf = num.text_frame
        tf.margin_left = 0
        tf.margin_right = 0
        tf.margin_top = 0
        tf.margin_bottom = 0
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = tf.paragraphs[0]
        p.text = str(i + 1)
        p.alignment = PP_ALIGN.CENTER
        for run in p.runs:
            run.font.name = FONT
            run.font.size = Pt(12)
            run.font.bold = True
            run.font.color.rgb = WHITE
        textbox(slide, title, Inches(1.22), y - Inches(0.02), Inches(4.1), Inches(0.28), size=15, color=NAVY, bold=True)
        textbox(slide, body, Inches(1.22), y + Inches(0.28), Inches(4.25), Inches(0.5), size=10, color=MUTED, line_spacing=1.02)

    browser_frame(slide, SHOTS / "student-labs.png", Inches(6.05), Inches(1.52), Inches(6.6), Inches(4.9), caption="Student workspace: assignments, task progress, and evidence")
    notes(slide, "The differentiator is the class workflow: join by code, start a lab, get checked, submit evidence, and let the teacher see it live.")

    # ---------------------------------------------------------------- 4. Architecture
    slide = prs.slides.add_slide(blank)
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = PAPER
    header(slide, 4, "Architecture", "Three boundaries: browser, backend, runtime")
    footer(slide)
    boxes = [
        ("Browser", "React 19\nxterm.js\nCodeMirror", "No Docker socket"),
        ("Frontend + API", "nginx\nExpress 5\nREST + WebSocket", "Auth and ownership"),
        ("Docker engine", "dockerode\nHost daemon\nResource limits", "Only the backend"),
        ("Student sandbox", "DinD container\nInner daemon\nPrivate /root", "One per student"),
    ]
    for i, (title, body, note) in enumerate(boxes):
        x = Inches(0.55 + i * 3.13)
        fill = NAVY if i in (0, 2) else WHITE
        fg = WHITE if i in (0, 2) else NAVY
        sub = RGBColor(175, 205, 225) if i in (0, 2) else MUTED
        card(slide, x, Inches(1.75), Inches(2.65), Inches(2.3), fill=fill, line=LINE if i in (1, 3) else fill)
        textbox(slide, title, x + Inches(0.2), Inches(1.98), Inches(2.2), Inches(0.3), size=15, color=fg, bold=True)
        textbox(slide, body, x + Inches(0.2), Inches(2.38), Inches(2.22), Inches(0.9), size=11, color=sub, line_spacing=1.15)
        textbox(slide, note, x + Inches(0.2), Inches(3.62), Inches(2.2), Inches(0.25), size=9, color=TEAL if i in (1, 3) else RGBColor(125, 211, 252), bold=True)
        if i < 3:
            arrow = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, x + Inches(2.72), Inches(2.7), Inches(0.3), Inches(0.22))
            solid(arrow, RGBColor(148, 163, 184))

    card(slide, Inches(0.65), Inches(4.38), Inches(5.85), Inches(1.35), fill=WHITE, line=LINE)
    textbox(slide, "Control plane", Inches(0.9), Inches(4.55), Inches(5.2), Inches(0.25), size=10, color=TEAL, bold=True)
    textbox(slide, "JWT auth · class membership · session lifecycle\nchecker · file read/write · Docker inventory", Inches(0.9), Inches(4.84), Inches(5.2), Inches(0.65), size=11, color=INK, line_spacing=1.08)
    card(slide, Inches(6.75), Inches(4.38), Inches(5.85), Inches(1.35), fill=WHITE, line=LINE)
    textbox(slide, "Data plane", Inches(7.0), Inches(4.55), Inches(5.2), Inches(0.25), size=10, color=TEAL, bold=True)
    textbox(slide, "WebSocket terminal · docker exec · fixed commands\nper-session checks · read-only teacher attach", Inches(7.0), Inches(4.84), Inches(5.2), Inches(0.65), size=11, color=INK, line_spacing=1.08)
    textbox(slide, "The terminal is a docker exec into the student's own container. The browser never receives /var/run/docker.sock.", Inches(0.65), Inches(6.02), Inches(11.8), Inches(0.35), size=11, color=MUTED, align=PP_ALIGN.CENTER)
    notes(slide, "Explain the three boundaries. The most important security sentence is that students never receive the Docker socket; the backend owns it.")

    # ---------------------------------------------------------------- 5. Platform modules
    slide = prs.slides.add_slide(blank)
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = PAPER
    header(slide, 5, "Inside the platform", "Small modules with clear jobs")
    footer(slide)
    modules = [
        ("Labs & assignments", "Handout labs, a short demo tour, and practice labs. Exact task steps and due dates."),
        ("Checker", "15 s timeout, serialized per session, 30 s background loop plus a manual check button."),
        ("Terminal", "xterm.js over WebSocket, shared exec, scrollback, and read-only teacher attach."),
        ("Workspace", "/root file listing, UTF-8 reads/writes, 256 KiB cap, teacher read-only."),
        ("Docker inventory", "Fixed ps / images / networks / volumes commands, capped at 200 rows."),
        ("Evidence & grades", "Uploads, feedback, protected downloads, and a student-visible grade."),
    ]
    for i, (title, body) in enumerate(modules):
        col = i % 3
        row = i // 3
        x = Inches(0.62 + col * 4.12)
        y = Inches(1.65 + row * 2.05)
        card(slide, x, y, Inches(3.82), Inches(1.75), fill=WHITE)
        accent = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, Inches(0.06), Inches(1.75))
        solid(accent, CYAN if i % 2 == 0 else TEAL)
        textbox(slide, title, x + Inches(0.25), y + Inches(0.22), Inches(3.35), Inches(0.28), size=15, color=NAVY, bold=True)
        textbox(slide, body, x + Inches(0.25), y + Inches(0.62), Inches(3.3), Inches(0.85), size=10, color=MUTED, line_spacing=1.08)
    textbox(slide, "No arbitrary Docker API proxy. No host shell. No student access to the host daemon.", Inches(0.65), Inches(6.02), Inches(11.9), Inches(0.3), size=12, color=TEAL, bold=True, align=PP_ALIGN.CENTER)
    notes(slide, "This slide is the feature map. Keep each module to one sentence; the next slides show the two main user journeys.")

    # ---------------------------------------------------------------- 6. Student flow
    slide = prs.slides.add_slide(blank)
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = PAPER
    header(slide, 6, "Student experience", "From join code to checked work in one screen")
    footer(slide)
    steps = [
        ("Join the class", "Use the class code, or sign in with a seeded student account."),
        ("Start a lab", "VLab provisions a private DinD container and waits for the inner daemon."),
        ("Run the commands", "Use the live terminal, or edit files in the Code tab."),
        ("Check my work", "State-based checks turn green when the files and containers exist."),
        ("Submit evidence", "Attach a screenshot or PDF; the teacher can review and grade it."),
    ]
    numbered_steps(slide, steps, Inches(0.68), Inches(1.62), Inches(5.3), step_gap=0.78, size=13)
    code_strip(slide, "docker run -d --name basic-web \\\n  -p 8080:80 nginx:alpine\ncurl -fsS http://localhost:8080 \\\n  > /root/demo/page.html", Inches(0.68), Inches(5.7), Inches(5.15), Inches(1.02))
    browser_frame(slide, SHOTS / "student-terminal.png", Inches(6.12), Inches(1.55), Inches(6.55), Inches(5.0), caption="A real shell in the browser, connected to the student's container")
    notes(slide, "Walk through the student journey. The terminal screenshot is a real build inside the sandbox; the code strip is the simple demo path.")

    # ---------------------------------------------------------------- 7. Teacher view
    slide = prs.slides.add_slide(blank)
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = PAPER
    header(slide, 7, "Teacher experience", "See the class, not just the final screenshot")
    footer(slide)
    browser_frame(slide, SHOTS / "teacher-overview.png", Inches(0.62), Inches(1.55), Inches(7.55), Inches(5.0), caption="Four classes, live labs, and evidence waiting for review")
    stats = [
        ("4", "classes"),
        ("9", "seeded students"),
        ("1", "live lab"),
        ("0", "to review"),
    ]
    for i, (value, label) in enumerate(stats):
        y = Inches(1.68 + i * 1.08)
        card(slide, Inches(8.55), y, Inches(1.15), Inches(0.86), fill=WHITE)
        textbox(slide, value, Inches(8.68), y + Inches(0.08), Inches(0.9), Inches(0.35), size=22, color=NAVY, bold=True)
        textbox(slide, label, Inches(8.68), y + Inches(0.48), Inches(0.9), Inches(0.22), size=8, color=MUTED)
    bullet_list(slide, [
        "Roster grid with per-task ticks and progress %",
        "Last command and last activity for each student",
        "Read-only terminal, files, and Docker inventory",
        "Evidence queue with feedback and grades",
    ], Inches(9.9), Inches(1.7), Inches(2.8), Inches(4.4), size=10, gap=10)
    notes(slide, "The teacher view is the strongest differentiator. Point out progress, last command, evidence, and read-only inspection.")

    # ---------------------------------------------------------------- 8. Security
    slide = prs.slides.add_slide(blank)
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = PAPER
    header(slide, 8, "Trust boundaries", "Isolation that fits a classroom")
    footer(slide)
    layers = [
        ("Browser", "JWT + role checks\nNo Docker socket\nTeacher input dropped", RGBColor(226, 238, 248), NAVY),
        ("Backend", "Owns docker.sock\nOwnership checks\nFixed inventory", TEAL_LIGHT, TEAL),
        ("Runtime", "1 GB / 1 CPU / 512 PIDs\nPer-student DinD\nPrivate /root", AMBER_LIGHT, AMBER),
    ]
    for i, (title, body, fill, color) in enumerate(layers):
        x = Inches(0.65 + i * 3.7)
        card(slide, x, Inches(1.68), Inches(3.35), Inches(1.75), fill=fill, line=fill)
        textbox(slide, title, x + Inches(0.22), Inches(1.88), Inches(2.8), Inches(0.3), size=16, color=color, bold=True)
        textbox(slide, body, x + Inches(0.22), Inches(2.28), Inches(2.9), Inches(0.85), size=10, color=INK, line_spacing=1.12)
        if i < 2:
            arrow = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, x + Inches(3.44), Inches(2.45), Inches(0.2), Inches(0.2))
            solid(arrow, RGBColor(148, 163, 184))
    bullet_list(slide, [
        "Path-normalised /root files, UTF-8 only, 256 KiB maximum",
        "Teacher file writes return 403; teacher terminal input is dropped",
        "Docker inventory is a fixed allowlist, not a proxy",
        "Command logging is advisory; checks never read the log",
    ], Inches(0.72), Inches(3.95), Inches(6.0), Inches(2.0), size=12, gap=10)
    card(slide, Inches(7.05), Inches(3.92), Inches(5.6), Inches(1.9), fill=WHITE, line=LINE)
    textbox(slide, "Deliberate boundary", Inches(7.3), Inches(4.12), Inches(5.0), Inches(0.25), size=10, color=AMBER, bold=True)
    textbox(slide, "DinD is privileged by design. Isolation is namespace-level, not a hostile multi-tenant boundary.", Inches(7.3), Inches(4.44), Inches(4.95), Inches(0.7), size=14, color=NAVY, bold=True, line_spacing=1.08)
    textbox(slide, "For production: microVM per student or dedicated lab hosts.", Inches(7.3), Inches(5.3), Inches(4.95), Inches(0.35), size=10, color=MUTED)
    notes(slide, "Be explicit about the trade-off: this is safe for a classroom demo, not for arbitrary hostile users. Production would use microVMs or dedicated hosts.")

    # ---------------------------------------------------------------- 9. Verification
    slide = prs.slides.add_slide(blank)
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = PAPER
    header(slide, 9, "Verification", "Verified with real containers, not mocks")
    footer(slide)
    metrics = [
        ("47", "backend unit tests"),
        ("41", "smoke checks"),
        ("4/4", "checks in the demo lab"),
        ("100%", "frontend build"),
    ]
    for i, (value, label) in enumerate(metrics):
        x = Inches(0.65 + i * 3.02)
        card(slide, x, Inches(1.65), Inches(2.75), Inches(1.25), fill=WHITE)
        textbox(slide, value, x + Inches(0.2), Inches(1.78), Inches(2.2), Inches(0.45), size=28, color=NAVY, bold=True)
        textbox(slide, label, x + Inches(0.2), Inches(2.35), Inches(2.3), Inches(0.25), size=9, color=MUTED)
    bullet_list(slide, [
        "Login, class join, assignment visibility, and teacher dashboard",
        "Real DinD provisioning, WebSocket terminal, and command logging",
        "Checker verdicts, editor save/read, and teacher read-only access",
        "Docker inventory, evidence flow, and cleanup",
        "A negative check: version tasks stay red until files exist",
    ], Inches(0.72), Inches(3.25), Inches(6.2), Inches(2.5), size=12, gap=10)
    card(slide, Inches(7.15), Inches(3.18), Inches(5.45), Inches(2.45), fill=NAVY, line=NAVY)
    textbox(slide, "SMOKE OK", Inches(7.45), Inches(3.42), Inches(4.7), Inches(0.4), size=22, color=RGBColor(110, 231, 183), bold=True, font=MONO)
    textbox(slide, "One command exercises the full stack:\nprovision → terminal → check → dashboard\n→ files → Docker → evidence → cleanup.", Inches(7.45), Inches(3.95), Inches(4.8), Inches(1.1), size=13, color=RGBColor(226, 238, 248), line_spacing=1.15)
    textbox(slide, "cd backend  ·  npm run smoke", Inches(7.45), Inches(5.12), Inches(4.8), Inches(0.25), size=10, color=RGBColor(125, 211, 252), font=MONO)
    notes(slide, "Lead with evidence. The smoke test is the strongest proof because it uses the real API, real WebSocket, real container, and real checker.")

    # ---------------------------------------------------------------- 10. Close
    slide = prs.slides.add_slide(blank)
    bg = slide.background.fill
    bg.solid()
    bg.fore_color.rgb = NAVY
    block = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(-1.0), Inches(4.8), Inches(7.4), Inches(4.3))
    solid(block, NAVY_SOFT)
    block.adjustments[0] = 0.18
    accent = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.7), Inches(0.72), Inches(0.72), Inches(0.08))
    solid(accent, CYAN)
    textbox(slide, "LIMITS  ·  NEXT  ·  QUESTIONS", Inches(0.7), Inches(0.98), Inches(6.0), Inches(0.24), size=10, color=RGBColor(125, 211, 252), bold=True)
    textbox(slide, "What we would build next", Inches(0.66), Inches(1.38), Inches(6.0), Inches(0.6), size=32, color=WHITE, bold=True)
    bullet_list(slide, [
        "Replace DinD with a microVM runtime for stronger isolation",
        "Move from SQLite to PostgreSQL for multi-instance hosting",
        "Add LTI / LMS integration and CSV gradebook export",
        "Add per-task hints, richer editor, and scheduled lab templates",
    ], Inches(0.72), Inches(2.28), Inches(6.0), Inches(2.8), size=13, color=RGBColor(226, 238, 248), bullet_color=RGBColor(125, 211, 252), gap=12)
    textbox(slide, "VLab is a working MVP: one student, one sandbox, one live class view.", Inches(0.72), Inches(5.55), Inches(6.1), Inches(0.6), size=15, color=RGBColor(148, 178, 204), line_spacing=1.1)

    card(slide, Inches(7.35), Inches(1.35), Inches(5.3), Inches(4.9), fill=WHITE, line=WHITE)
    textbox(slide, "Project at a glance", Inches(7.65), Inches(1.6), Inches(4.6), Inches(0.3), size=11, color=TEAL, bold=True)
    textbox(slide, "VLab", Inches(7.62), Inches(1.98), Inches(4.5), Inches(0.55), size=28, color=NAVY, bold=True)
    textbox(slide, "Container Based Application Development Lab", Inches(7.65), Inches(2.55), Inches(4.6), Inches(0.3), size=10, color=MUTED)
    divider = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(7.65), Inches(3.0), Inches(4.6), Inches(0.012))
    solid(divider, LINE)
    facts = [
        ("Runtime", "Docker Compose"),
        ("Backend", "Node 22 · Express 5 · Prisma"),
        ("Frontend", "React 19 · Vite · Tailwind"),
        ("Isolation", "One DinD sandbox per student"),
        ("Demo", "Basic Linux & Docker tour"),
    ]
    for i, (label, value) in enumerate(facts):
        y = Inches(3.2 + i * 0.52)
        textbox(slide, label, Inches(7.65), y, Inches(1.25), Inches(0.22), size=8, color=MUTED)
        textbox(slide, value, Inches(8.9), y - Inches(0.02), Inches(3.35), Inches(0.26), size=11, color=NAVY, bold=True)
    textbox(slide, "Thank you  ·  Questions?", Inches(7.65), Inches(5.75), Inches(4.4), Inches(0.35), size=16, color=TEAL, bold=True)
    notes(slide, "Close with the trade-off and the roadmap. Emphasise that the MVP is real: the demo runs a container, checks state, and shows the teacher the same workspace.")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    prs.save(OUT)
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1024 / 1024:.2f} MB)")


if __name__ == "__main__":
    main()
