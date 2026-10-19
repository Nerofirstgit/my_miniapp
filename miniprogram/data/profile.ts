export const profile = {
  name: "康彤",
  role: "全栈开发者",
  studio: "天工开物工作室",
  introduction: "你好，我叫康彤，是一名有着 12 年经验的全栈开发者，拥有从产品构思、界面设计到前后端开发、部署上线的完整经验。",
  philosophy: "我希望每一款作品，既稳定好用，也让人眼前一亮。",
  services: ["软件定制", "小程序开发", "网站开发", "企业数字化"],
};

// 中文段落、经历和技能来自参考网站当前公开数据；详见 docs/ASSET-SOURCES.md。
export const paragraphs = [
  profile.introduction,
  "相比单纯实现功能，我更在意程序的设计感与使用体验，喜欢打造有审美、有风格、有辨识度的数字产品。",
  "我专注软件定制、APP/小程序、Web系统与企业数字化开发，为客户提供从需求梳理、方案设计、开发实现到上线维护的一站式服务。",
  profile.philosophy,
];

export const experiences = [
  {
    id: "freelance",
    number: "01",
    period: "2026至目前",
    organization: "自由职业者",
    logo: "/assets/icons/logo.png",
    logoAlt: "康彤 logo",
    role: "全栈开发",
    description: "专注软件定制、APP / 小程序、Web 系统与企业数字化开发。从需求梳理、方案设计，到前后端开发、部署上线与维护，参与产品落地的完整过程，让技术与设计相互成就。",
    tags: ["软件定制", "全栈开发", "企业数字化"],
  },
  {
    id: "ping-an-life",
    number: "02",
    period: "2017-2026",
    organization: "中国平安人寿",
    logo: "/assets/icons/companies/ping-an.png",
    logoAlt: "中国平安 logo",
    role: "全栈工程师",
    description: "负责客户模块的开发与维护，支持寿险“双12”活动，助力公司实现 10 亿元销售额。在 EAST 2.0 监管项目中，基于大模型构建规则校验的自动化开发与测试全流程，推动项目效率提升 97% 以上，节约约 3 人年工时。",
    tags: ["全栈开发", "自动化开发"],
  },
  {
    id: "hon-hai",
    number: "03",
    period: "2014-2016",
    organization: "鸿海工业",
    logo: "/assets/icons/companies/hon-hai.png",
    logoAlt: "鸿海 logo",
    role: "开发工程师",
    description: "围绕生产流水线的检测与识别需求，负责机器视觉相关软件开发，实现板宽测量、条码扫描等功能。",
    tags: ["工业软件开发"],
  },
];

export const skills = [
  { id: "html", name: "HTML", label: "标记语言", icon: "/assets/icons/skills/html5.png", number: "01" },
  { id: "css", name: "CSS", label: "样式设计", icon: "/assets/icons/skills/css3.png", number: "02" },
  { id: "javascript", name: "JavaScript", label: "编程语言", icon: "/assets/icons/skills/javascript.png", number: "03" },
  { id: "typescript", name: "TypeScript", label: "编程语言", icon: "/assets/icons/skills/typescript.png", number: "04" },
  { id: "java", name: "Java", label: "后端开发", icon: "/assets/icons/skills/java.png", number: "05" },
  { id: "spring", name: "Spring", label: "后端框架", icon: "/assets/icons/skills/spring.png", number: "06" },
  { id: "nextjs", name: "Next.js", label: "应用框架", icon: "/assets/icons/skills/nextjs.png", number: "07" },
  { id: "react", name: "React", label: "界面组件库", icon: "/assets/icons/skills/react.png", number: "08" },
  { id: "vue", name: "Vue", label: "应用框架", icon: "/assets/icons/skills/vuejs.png", number: "09" },
  { id: "zustand", name: "Zustand", label: "状态管理", icon: "/assets/icons/skills/zustand.png", number: "10" },
  { id: "mysql", name: "MySQL", label: "数据库", icon: "/assets/icons/skills/mysql.png", number: "11" },
  { id: "oracle", name: "Oracle", label: "数据库", icon: "/assets/icons/skills/oracle.png", number: "12" },
  { id: "kafka", name: "Kafka", label: "事件流处理", icon: "/assets/icons/skills/apachekafka.png", number: "13" },
  { id: "nginx", name: "Nginx", label: "网站服务器", icon: "/assets/icons/skills/nginx.png", number: "14" },
  { id: "python", name: "Python", label: "编程语言", icon: "/assets/icons/skills/python.png", number: "15" },
  { id: "figma", name: "Figma", label: "设计工具", icon: "/assets/icons/skills/figma.png", number: "16" },
];

export const contact = {
  phone: "+8613634686433",
  phoneDisplay: "+86 136 3468 6433",
  wechat: "freenero879",
  email: "nero.t.kang@gmail.com",
  qrCode: "/assets/wechat.png",
};
