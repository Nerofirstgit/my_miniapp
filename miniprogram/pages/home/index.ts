import { contact, experiences, paragraphs, profile, skills } from "../../data/profile";
import { getProject, projectPath, projects } from "../../data/projects";
import { callPhone, copyText, showActionFailure } from "../../utils/actions";
import { createHomeCopy } from "../../utils/home-copy";

const introParagraphs = paragraphs.map((text, paragraphIndex) => {
  let opacityIndex = 0;
  const characters = Array.from(text, (character, id) => ({
    id, text: character, opacityIndex: /\s/.test(character) ? -1 : opacityIndex++,
  }));
  return { id: `intro-${paragraphIndex}`, text, characters, count: opacityIndex };
});

const sections = [
  { id: "hero", label: "主页" }, { id: "about", label: "关于我" },
  { id: "works", label: "作品" }, { id: "experience", label: "经历" },
  { id: "skills", label: "技能" }, { id: "contact", label: "联系我" },
];

interface RevealPosition { key: string; top: number; height: number }

Page({
  data: {
    profile, contact, experiences, paragraphs, skills, sections,
    ...createHomeCopy(),
    titleProgress: {} as Record<string, number>,
    introParagraphs,
    introProgress: paragraphs.map(() => 0),
    projects: projects.map((project, index) => ({ ...project, number: `0${index + 1}` })),
    contactVisible: false, menuOpen: false, skillsExpanded: false,
    heroContactPanel: "" as "" | "phone" | "wechat", heroQrFailed: false,
    motionActive: true, titlePressed: false, showBackTop: false,
    activeSection: "hero", activeLabel: "主页", pullIndex: 0,
    headerHeight: 88, statusHeight: 44, menuRight: 110, heroTitleTop: 160,
    failedImages: {} as Record<string, boolean>,
    failedMotion: {} as Record<string, boolean>,
    visibleWorks: {} as Record<string, boolean>,
    revealed: {} as Record<string, boolean>, revealEnabled: false,
    revealStyles: {} as Record<string, string>,
  },
  _observer: null as WechatMiniprogram.IntersectionObserver | null,
  _positions: [] as { id: string; top: number }[],
  _revealPositions: [] as RevealPosition[],
  _viewportHeight: 800, _maxScroll: Infinity, _measurement: 0,
  _scrollTop: 0, _touchY: 0, _pulling: false, _suppressTap: false,
  _ready: false, _disposed: false,
  onLoad() {
    this._disposed = false;
    this._ready = false;
    this.setData({
      introProgress: this.data.introProgress.map(() => 0),
      copyProgress: this.data.copyProgress.map(() => 0),
      titleProgress: {},
    });
    this.updateInsets();
  },
  onReady() {
    this._ready = true;
    this.measureSections();
    this._observer?.disconnect();
    const observer = this.createIntersectionObserver({ nativeMode: true, observeAll: true, thresholds: [0, 0.08] });
    this._observer = observer;
    observer.relativeToViewport({ top: -this.data.headerHeight, bottom: -20 }).observe(".visibility-target", (result) => {
      if (this._disposed || this._observer !== observer) return;
      const key = result.dataset.key as string;
      if (!key) return;
      const visible = result.intersectionRatio > 0;
      if (visible !== this.data.revealed[key]) {
        this.setData({ revealed: { ...this.data.revealed, [key]: visible } });
      }
      if (getProject(key)) {
        const visible = result.intersectionRatio > 0;
        if (this.data.visibleWorks[key] !== visible) {
          this.setData({ visibleWorks: { ...this.data.visibleWorks, [key]: visible } });
        }
      }
    });
    this.setData({ revealEnabled: true });
  },
  onShow() { this.setData({ motionActive: true }); },
  onHide() {
    this._pulling = false;
    this._suppressTap = false;
    this.setData({ menuOpen: false, motionActive: false, titlePressed: false, heroContactPanel: "" });
  },
  onUnload() { this._disposed = true; this._observer?.disconnect(); this._observer = null; },
  onResize() { this.closeHeroContact(); this.updateInsets(); this.measureSections(); },
  updateInsets() {
    const window = wx.getWindowInfo();
    this._viewportHeight = window.windowHeight;
    const capsule = wx.getMenuButtonBoundingClientRect();
    const statusHeight = window.statusBarHeight || 20;
    const headerHeight = statusHeight + 44;
    const titleHeight = Math.min((window.windowWidth - 30) / 1.65, 420);
    // Center the complete two-line title on the upper golden-section point.
    const heroTitleTop = Math.max(headerHeight + 16, window.windowHeight * .382 - titleHeight / 2);
    this.setData({ statusHeight, headerHeight, heroTitleTop,
      menuRight: Math.max(100, window.windowWidth - capsule.left + 8) });
  },
  measureSections() {
    if (!this._ready || this._disposed) return;
    const measurement = ++this._measurement;
    wx.nextTick(() => {
      if (this._disposed) return;
      const query = this.createSelectorQuery();
      query.selectAll(".anchor").boundingClientRect();
      query.selectViewport().scrollOffset();
      query.selectAll(".reveal").fields({ dataset: true, rect: true, size: true });
      query.select(".portfolio").boundingClientRect();
      query.exec((results) => {
        const rects = results[0] as WechatMiniprogram.BoundingClientRectCallbackResult[] | null;
        const viewport = results[1] as { scrollTop: number } | null;
        if (!rects || !viewport || this._disposed || measurement !== this._measurement) return;
        this._positions = rects.map((rect) => ({ id: rect.id, top: rect.top + viewport.scrollTop }));
        const reveals = results[2] as { dataset: { key: string }; top: number; height: number }[] | null;
        const content = results[3] as { height: number } | null;
        if (content) this._maxScroll = Math.max(0, content.height - this._viewportHeight);
        this._revealPositions = (reveals || []).map((rect) => ({ key: rect.dataset.key, top: rect.top + viewport.scrollTop, height: rect.height }));
        this.syncSection();
        this.syncReveals();
      });
    });
  },
  onPageScroll(event: WechatMiniprogram.Page.IPageScrollOption) {
    this.closeHeroContact();
    this._scrollTop = event.scrollTop;
    const showBackTop = event.scrollTop > 400;
    if (showBackTop !== this.data.showBackTop) this.setData({ showBackTop });
    this.syncSection();
    this.syncReveals();
  },
  syncReveals() {
    if (this._disposed) return;
    // Only one scalar per text block crosses the logic/view bridge. WXS keeps
    // per-character interpolation in the view layer, including reverse scroll.
    const update: Record<string, number | Record<string, string>> = {};
    const styles = { ...this.data.revealStyles };
    let changed = false;
    for (const item of this._revealPositions) {
      // Keep the top-85% → bottom-60% reveal, but leave a fade interval for
      // bottom text and tolerate subpixel rounding when page scrolling settles.
      const end = Math.max(0, Math.min(Math.max(0, this._maxScroll - 1), item.top + item.height - this._viewportHeight * .6));
      const start = Math.max(0, Math.min(item.top - this._viewportHeight * .85, end - Math.min(120, this._viewportHeight * .15)));
      const progress = end === start ? (this._scrollTop >= end ? 1 : 0) : Math.max(0, Math.min(1, (this._scrollTop - start) / (end - start)));
      const paragraph = /^intro-(\d+)$/.exec(item.key);
      if (paragraph && this.data.introParagraphs[Number(paragraph[1])]) {
        const index = Number(paragraph[1]);
        if (this.data.introProgress[index] !== progress) update[`introProgress[${index}]`] = progress;
        continue;
      }
      const copyRun = /^copy-(\d+)$/.exec(item.key);
      if (copyRun && this.data.copyRuns[Number(copyRun[1])]) {
        const index = Number(copyRun[1]);
        if (this.data.copyProgress[index] !== progress) update[`copyProgress[${index}]`] = progress;
        continue;
      }
      if (item.key !== "hero" && sections.some((section) => section.id === item.key)) {
        if (this.data.titleProgress[item.key] !== progress) {
          update[`titleProgress.${item.key}`] = progress;
        }
        continue;
      }
      const style = `opacity:${(.12 + .88 * progress).toFixed(2)}`;
      if (styles[item.key] !== style) { styles[item.key] = style; changed = true; }
    }
    if (changed) update.revealStyles = styles;
    if (Object.keys(update).length) this.setData(update);
  },
  syncSection() {
    const current = this._positions.filter((position) => position.top <= this._scrollTop + this.data.headerHeight + 80).pop();
    const section = sections.find((item) => item.id === current?.id) || sections[0];
    if (section.id !== this.data.activeSection) this.setData({ activeSection: section.id, activeLabel: section.label });
  },
  navigateSection(event: WechatMiniprogram.TouchEvent) { this.scrollToSection(event.currentTarget.dataset.id); },
  scrollToSection(id: unknown) {
    if (typeof id !== "string" || !sections.some((section) => section.id === id)) return;
    this.setData({ menuOpen: false, heroContactPanel: "" }, () => {
      wx.pageScrollTo({ ...(id === "hero" ? { scrollTop: 0 } : { selector: `#${id}`, offsetTop: -this.data.headerHeight }),
        duration: 350, fail: () => showActionFailure("定位暂不可用，请滑动查看") });
    });
  },
  toggleMenu() {
    if (this._suppressTap) { this._suppressTap = false; return; }
    this.setData({ menuOpen: !this.data.menuOpen, heroContactPanel: "", pullIndex: Math.max(0, sections.findIndex((item) => item.id === this.data.activeSection)) });
  },
  closeMenu() { this.setData({ menuOpen: false }); },
  onMenuTouchStart(event: WechatMiniprogram.TouchEvent) {
    this.closeHeroContact();
    this._touchY = event.touches[0]?.clientY ?? 0;
    this._pulling = false;
    this._suppressTap = false;
  },
  onMenuTouchMove(event: WechatMiniprogram.TouchEvent) {
    if (!event.touches[0]) return;
    const distance = event.touches[0].clientY - this._touchY;
    if (distance < 40 && !this._pulling) return;
    this._pulling = true;
    if (!this.data.menuOpen) this.setData({ menuOpen: true,
      pullIndex: Math.max(0, sections.findIndex((item) => item.id === this.data.activeSection)) });
  },
  onMenuTouchEnd() {
    if (!this._pulling) return;
    this._pulling = false;
    this._suppressTap = true;
  },
  onMenuTouchCancel() { this._pulling = false; this._suppressTap = true; this.closeMenu(); },
  toggleSkills() {
    const collapsing = this.data.skillsExpanded;
    this.setData({ skillsExpanded: !collapsing }, () => {
      this.measureSections();
      if (collapsing) this.scrollToSection("skills");
    });
  },
  pressTitle() { this.setData({ titlePressed: true }); },
  releaseTitle() { this.setData({ titlePressed: false }); },
  openProject(event: WechatMiniprogram.TouchEvent) {
    const project = getProject(event.currentTarget.dataset.id);
    if (!project) { showActionFailure("暂时找不到这个作品，请重新选择"); return; }
    wx.navigateTo({ url: projectPath(project.id), fail: () => showActionFailure("暂时无法打开作品，请重试") });
  },
  onCoverError(event: WechatMiniprogram.CustomEvent) {
    const project = getProject(event.currentTarget.dataset.id);
    if (project) this.setData({ failedImages: { ...this.data.failedImages, [project.id]: true } });
  },
  onMotionError(event: WechatMiniprogram.CustomEvent) {
    const project = getProject(event.currentTarget.dataset.id);
    if (project) this.setData({ failedMotion: { ...this.data.failedMotion, [project.id]: true } });
  },
  toggleHeroContact(event: WechatMiniprogram.TouchEvent) {
    const panel = event.currentTarget.dataset.id;
    if (panel !== "phone" && panel !== "wechat") return;
    this.setData({ heroContactPanel: this.data.heroContactPanel === panel ? "" : panel, menuOpen: false });
  },
  closeHeroContact() {
    if (this.data.heroContactPanel) this.setData({ heroContactPanel: "" });
  },
  // Stop taps inside the popover from reaching the page's outside-tap handler.
  keepHeroContactOpen() {},
  onHeroQrError() { this.setData({ heroQrFailed: true }); },
  showContact() { this.setData({ menuOpen: false, heroContactPanel: "", contactVisible: true }); },
  closeContact() { this.setData({ contactVisible: false }); },
  scrollToWorks() { this.scrollToSection("works"); },
  backToTop() { this.scrollToSection("hero"); },
  call() { callPhone(contact.phone); },
  copyWechat() { copyText(contact.wechat); },
  copyEmail() { copyText(contact.email); },
  onShareAppMessage() { return { title: "康彤的作品集｜从想法到落地", path: "/pages/home/index" }; },
});
