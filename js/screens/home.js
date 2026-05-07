import { navigate } from '../app.js';
import { VERSION } from '../version.js';

export async function mount(container) {
  container.innerHTML = `
    <div class="screen">
      <div class="app-bar">
        <div class="app-bar-title">Game <span>Tracker</span> <span class="app-version-badge">${VERSION}</span></div>
      </div>
      <div class="scroll-area">
        <div class="section-cards-list">
          <div class="section-card" id="card-tracker" style="background-image:url('./img/home-tracker.jpg')">
            <div class="section-card-overlay"></div>
            <div class="section-card-icon">📅</div>
            <div class="section-card-body">
              <div class="section-card-title">Daily / Weekly Tracker</div>
              <div class="section-card-subtitle">Track resets &amp; daily tasks for your games</div>
            </div>
          </div>
          <div class="section-card" id="card-builds" style="background-image:url('./img/home-builds.jpg')">
            <div class="section-card-overlay"></div>
            <div class="section-card-icon">⚔️</div>
            <div class="section-card-body">
              <div class="section-card-title">Game Builds</div>
              <div class="section-card-subtitle">Manage builds &amp; loadouts for your characters</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('card-tracker').addEventListener('click', () => navigate('tracker'));
  document.getElementById('card-builds').addEventListener('click', () => navigate('builds-home'));
}
