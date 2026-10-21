import { getProject, projectPath } from "../../data/projects";
import type { Project } from "../../data/projects";
import { portfolioShare } from "../../data/share";
import { copyText, previewImage, showActionFailure } from "../../utils/actions";

Page({
  data: { project: null as Project | null, contactVisible: false, coverFailed: false },
  onLoad(options: Record<string, string | undefined>) {
    const project = getProject(options.id);
    if (!project) return;
    this.setData({ project });
    wx.setNavigationBarTitle({ title: project.title, fail: () => showActionFailure("页面标题暂未更新，可继续浏览") });
  },
  onCoverError() { this.setData({ coverFailed: true }); },
  showCover() {
    if (this.data.project) previewImage(this.data.project.cover);
  },
  copyProjectUrl() {
    if (this.data.project) copyText(this.data.project.url);
  },
  showContact() { this.setData({ contactVisible: true }); },
  closeContact() { this.setData({ contactVisible: false }); },
  goHome() {
    wx.reLaunch({ url: "/pages/home/index", fail: () => showActionFailure("暂时无法返回首页，请重新打开小程序") });
  },
  onShareAppMessage() {
    const project = this.data.project;
    return project
      ? { title: `${project.title}｜康彤的作品集`, path: projectPath(project.id), imageUrl: project.cover }
      : { ...portfolioShare };
  },
});
