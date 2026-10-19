import { contact, experiences, skills } from "../data/profile";
import { projects } from "../data/projects";

interface CopyRun {
  id: number;
  text: string;
  count: number;
  characters: { id: number; text: string; opacityIndex: number }[];
}

// Keep one independently measured run for each visible text block. Whitespace
// stays in the rendered copy but does not consume a character's stagger slot.
export function createHomeCopy() {
  const copyRuns: CopyRun[] = [];
  const copyProgress: number[] = [];
  const add = (text: string) => {
    const id = copyRuns.length;
    let opacityIndex = 0;
    const characters = Array.from(text, (character, characterId) => ({
      id: characterId, text: character, opacityIndex: /\s/.test(character) ? -1 : opacityIndex++,
    }));
    copyRuns.push({ id, text, characters, count: opacityIndex });
    copyProgress.push(0);
    return id;
  };
  const copy = {
    projects: projects.map((project, index) => ({
      number: add(`0${index + 1}`), category: add(project.category), title: add(project.title),
      description: add(project.description), tags: project.tags.map(add),
    })),
    experiences: experiences.map((experience) => ({
      number: add(experience.number), period: add(experience.period), organization: add(experience.organization),
      role: add(experience.role), description: add(experience.description), tags: experience.tags.map(add),
    })),
    skills: skills.map((skill) => ({ number: add(skill.number), name: add(skill.name), label: add(skill.label) })),
    static: {
      aboutEyebrow: add("我的故事"), worksEyebrow: add("近期作品"), experienceEyebrow: add("职业旅程"),
      skillsEyebrow: add("专业能力"), contactEyebrow: add("开启对话"),
      contactInvitation: add("有个想法？\n一起把它实现。"),
      contactDescription: add("无论是一个新的产品、一份定制需求，还是一次关于技术与设计的交流，欢迎联系。"),
      phoneLabel: add("电话"), wechatLabel: add("微信"), emailLabel: add("邮箱"),
      phoneValue: add(contact.phoneDisplay), wechatValue: add(contact.wechat), emailValue: add(contact.email),
      phoneAction: add("拨打电话"), wechatAction: add("复制微信号"), emailAction: add("复制邮箱"),
      qrAction: add("查看二维码"),
    },
  };
  return { copy, copyRuns, copyProgress };
}
