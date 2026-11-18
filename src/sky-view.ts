import { climate, type Weather } from "./ecology";
// A presentation layer for the overhead camera: no shadow maps or per-star meshes.
export class SkyView {
  private element: HTMLDivElement;
  private last = "";
  constructor(host: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "sky-celestial";
    this.element.setAttribute("aria-hidden", "true");
    const stars = Array.from({ length: 64 }, (_, i) => {
      const x = (i * 137.508) % 1000,
        y = 15 + ((i * 37.31) % 115);
      return `<circle cx="${x}" cy="${y}" r="${i % 5 === 0 ? 1.5 : 0.8}" fill="#e8f2ff"/>`;
    }).join("");
    this.element.innerHTML = `<svg viewBox="0 0 1000 250" preserveAspectRatio="xMidYMin slice"><g class="sky-stars">${stars}</g><g class="sky-sun"><circle cx="830" cy="100" r="29" fill="#fff2bd" opacity=".15"/><circle cx="830" cy="100" r="18" fill="#fff2bd"/></g><g class="sky-moon"><circle cx="830" cy="100" r="20" fill="#e8ecdf"/><circle cx="823" cy="93" r="4" fill="#bac6c9"/><circle cx="838" cy="105" r="6" fill="#c5cfd0"/><circle cx="823" cy="109" r="2" fill="#b6c5c9"/></g><g class="sky-clouds" fill="#f4f8ff"><ellipse cx="620" cy="72" rx="68" ry="12"/><ellipse cx="600" cy="63" rx="28" ry="18"/><ellipse cx="638" cy="64" rx="34" ry="20"/><ellipse cx="350" cy="38" rx="50" ry="9"/><ellipse cx="337" cy="33" rx="25" ry="14"/></g></svg>`;
    host.append(this.element);
  }
  update(time: number, weather: Weather) {
    const key = `${Math.floor(time)}:${weather.cloud.toFixed(2)}`;
    if (key === this.last) return;
    this.last = key;
    const c = climate(time, weather);
    const day = Math.min(1, c.sunlight * 3);
    this.element.style.setProperty(
      "--night",
      String((1 - day) * (1 - weather.cloud * 0.8)),
    );
    this.element.style.setProperty("--day", String(day));
    this.element.style.setProperty(
      "--sky-cloud",
      String((0.3 + 0.65 * weather.cloud) * (0.3 + 0.7 * day)),
    );
    this.element.style.setProperty("--drift", `${Math.sin(time / 180) * 35}px`);
    this.element.dataset.period = c.period;
    this.element.parentElement!.dataset.period = c.period;
  }
}
