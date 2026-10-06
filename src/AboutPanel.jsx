import {BookOpen,Users,ChatText,Sparkle} from '@phosphor-icons/react';
import {Modal} from './Modal';
import {useI18n,t} from './i18n';
import {releaseInfo} from './releaseInfo';
import './about.css';

export function AboutPanel({onClose,onHelp}) {
  const {language}=useI18n(),en=language==='en';
  const features=en?[
    ['Plan scenes and characters','Arrange appearances, NPC groups and events on the level canvas. Keep shared profiles, quick notes, groups and relationships connected.',Users],
    ['Build and rehearse dialogue','Edit dialogue cards, choices, conditions and effects. Play a character’s conversation or follow a level’s story flow, then save play records.',ChatText],
    ['Collaborate with AI','Use your chosen model to draft character stories and NPC dialogue. Review and edit before adoption, work with bilingual Skills, and export design notes and dialogue tables.',Sparkle],
  ]:[
    ['规划场景与人物','在关卡画布安排人物出场、NPC 组和剧情事件，通过共享人物档案、快速备注、分组与关系画布集中管理角色。',Users],
    ['编排对白与预演','用卡片配置对白、玩家选项、条件和效果，试玩角色对话或跟随关卡模拟故事流程，并保留试玩记录。',ChatText],
    ['与 AI 协同创作','使用自己配置的模型起草人物故事与 NPC 台词，编辑审核后采用；通过中英文 Skill 与自己的 AI 协作，导出设计说明和对白表格。',Sparkle],
  ];
  return <Modal className="about-panel" title={en?'About NPCs AI Studio':'关于 NPCs AI Studio'} onClose={onClose}>
    <div className="about-body">
      <div className="about-version"><strong>v{releaseInfo.version}</strong><span>{en?'Preview':'预览版'}</span><span className="about-updated">{en?'Last updated':'最近更新'} <time dateTime={releaseInfo.updates[0].date}>{releaseInfo.updates[0].date}</time></span></div>
      <p className="about-intro">{en?'A local narrative workbench for game designers and writers. Turn story ideas into connected worlds, characters, scenes and playable dialogue flows.':'面向游戏设计师与编剧的本地叙事工作台，把故事想法整理为相互联动的世界设定、人物、关卡场景与可试玩的对白流程。'}</p>
      <div className="about-features">{features.map(([name,description,Icon])=><section key={name}><Icon size={20}/><div><h3>{name}</h3><p>{description}</p></div></section>)}</div>
      <section className="about-storage"><h3>{en?'Your projects stay local':'项目保存在本地'}</h3><p>{en?'Project content, drafts and play records stay in your local project folder. Manual editing and deterministic rehearsal work offline. AI generation connects to the service you configure; Windows supports locally encrypted API keys per model profile.':'工程内容、草稿与试玩记录保存在本地项目文件夹。手动编辑与确定性预演可离线使用；AI 生成连接你配置的服务，Windows 支持按模型配置加密记住 API Key。'}</p></section>
      <p className="about-workflow">{en?'World brief → scenes and characters → dialogue and story → rehearsal and delivery':'世界底稿 → 场景与人物 → 对白与剧情 → 预演与交付'}</p>
      <details className="about-updates" open>
        <summary>{en?'Update history':'更新记录'}</summary>
        <p className="about-update-note">{en?'Local development updates; this preview has not been formally released.':'以下为本地开发更新，当前预览版尚未正式发布。'}</p>
        {releaseInfo.updates.map(update=><article key={update.date}><time dateTime={update.date}>{update.date}</time><h3>{update.title[language]}</h3><ul>{update.changes[language].map(change=><li key={change}>{change}</li>)}</ul></article>)}
      </details>
    </div>
    <div className="modal-actions"><button className="secondary" onClick={onHelp}><BookOpen size={16}/>{t('使用帮助')}</button><button className="primary" onClick={onClose}>{t('返回工作台')}</button></div>
  </Modal>;
}
