// Simple lineage color generator and registry
class LineageColors {
    constructor() {
        this.cache = {};
    }

    // Palette copied from LineageChart.getColor() for consistent mapping
    palette() {
        return [
            '#333333', '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
        ];
    }

    // deterministic hash to integer
    _hashStr(s) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h >>> 0;
    }

    // returns a color string for the lineage id. For founder lineages like 'lineage_1'..'lineage_5'
    // we use the same palette as the LineageChart for exact visual matching.
    getColor(lineageId) {
        if (!lineageId) return null;
        if (this.cache[lineageId]) return this.cache[lineageId];

        // If lineageId ends with a numeric suffix (e.g. lineage_1), use palette index
        const m = lineageId.match(/_(\d+)$/);
        if (m) {
            const idx = parseInt(m[1], 10) - 1;
            const palette = this.palette();
            if (idx >= 0 && idx < palette.length) {
                this.cache[lineageId] = palette[idx];
                return this.cache[lineageId];
            }
            // otherwise fall through to HSL fallback using an index-based hue
            const hue = (idx * 42) % 360;
            const color = `hsl(${hue}, 65%, 45%)`;
            this.cache[lineageId] = color;
            return color;
        }

        if (this.cache[lineageId]) return this.cache[lineageId];
        const h = this._hashStr(lineageId) % 360; // hue
        const s = 70; // saturation
        const l = 45; // lightness
        const color = `hsl(${h}, ${s}%, ${l}%)`;
        this.cache[lineageId] = color;
        return color;
    }

    // darker variant for accents like eye slit
    getAccent(lineageId) {
        if (!lineageId) return null;
        const m = lineageId.match(/_(\d+)$/);
        if (m) {
            const idx = parseInt(m[1], 10) - 1;
            const palette = this.palette();
            if (idx >= 0 && idx < palette.length) {
                // convert hex to darker HSL-ish accent by returning a fixed accent for palette indices
                // simple approach: return the same hex but let canvas stroke/overlay differentiate
                return palette[idx];
            }
            const hue = (idx * 42) % 360;
            return `hsl(${hue}, 75%, 30%)`;
        }
        const h = this._hashStr(lineageId) % 360;
        const s = 75;
        const l = 28;
        return `hsl(${h}, ${s}%, ${l}%)`;
    }

    // Predator color (uniform for all predators)
    getPredatorColor() {
        // a slightly desaturated red that's visually distinct from lineage hues
        return 'hsl(10, 65%, 45%)';
    }

    getPredatorAccent() {
        return 'hsl(10, 75%, 30%)';
    }
}

module.exports = new LineageColors();
