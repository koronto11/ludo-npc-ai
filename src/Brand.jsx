import wordmark from './assets/npcs-wordmark.svg?no-inline';

export default function Brand() {
  return <div className="brand" aria-label="NPCs AI Studio">
    <span className="brand-title"><img className="brand-wordmark" src={wordmark} alt="NPCs" width="66" height="21" /><em>AI Studio</em></span>
  </div>;
}
