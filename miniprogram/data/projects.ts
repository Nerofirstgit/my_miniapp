export interface Project {
  id: string;
  title: string;
  category: string;
  description: string;
  tags: string[];
  cover: string;
  motion: string;
  coverAlt: string;
  url: string;
  introduction: string;
}

// 案例来自网站的已公开内容，后续可补充职责、技术栈与更多截图。
export const projects: Project[] = [
  {
    id: "mall",
    title: "商城系统",
    category: "电子商务",
    description: "围绕线上购物场景打造的商城系统。",
    tags: ["电子商务", "网站系统"],
    cover: "/assets/projects/mall.jpg",
    motion: "/assets/projects/mall-motion.gif",
    coverAlt: "商城系统封面：数码配件、手机通讯、家居生活等商品分类。",
    url: "https://kushop.vercel.app/",
    introduction: "围绕线上购物场景打造的商城系统。通过项目网页，可以进一步了解商品展示与购物场景。",
  },
  {
    id: "restaurant",
    title: "美味佳肴饭馆",
    category: "餐饮品牌",
    description: "为美味佳肴打造的线上介绍网站，让来访者从这里认识一家店。",
    tags: ["餐饮品牌", "展示网站"],
    cover: "/assets/projects/restaurant.jpg",
    motion: "/assets/projects/restaurant-motion.gif",
    coverAlt: "美味佳肴饭馆封面：锅包肉、小鸡炖蘑菇、地三鲜、熘肉段四道东北经典菜。",
    url: "https://gsap-test-82b.pages.dev/",
    introduction: "为美味佳肴打造的线上介绍网站，让来访者从这里认识一家店，了解品牌及地道东北风味。",
  },
];

export function getProject(id: unknown): Project | undefined {
  return typeof id === "string" ? projects.find((project) => project.id === id) : undefined;
}

export function projectPath(id: string): string {
  return `/pages/work-detail/index?id=${encodeURIComponent(id)}`;
}
