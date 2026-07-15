// const CellTypes = require("../Organism/Cell/CellTypes");
const CellStates = require("../Organism/Cell/CellStates");
const Directions = require("../Organism/Directions");

// Renderer controls access to a canvas. There is one renderer for each canvas
class Renderer {
    constructor(canvas_id, container_id, cell_size) {
        this.cell_size = cell_size;
        this.canvas = document.getElementById(canvas_id);
        this.ctx = this.canvas.getContext("2d");
        this.fillWindow(container_id)
        this.height = this.canvas.height;
        this.width = this.canvas.width;
        this.cells_to_render = new Set();
        this.cells_to_highlight = new Set();
        this.highlighted_cells = new Set();
    }

    fillWindow(container_id) {
        this.fillShape($('#' + container_id).height(), $('#' + container_id).width());
    }

    fillShape(height, width) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.height = this.canvas.height;
        this.width = this.canvas.width;
    }

    clear() {
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    renderFullGrid(grid) {
        this.clearUpdates();
        for (var col of grid) {
            for (var cell of col) {
                this.renderCell(cell);
            }
        }
    }

    renderCells() {
        for (var cell of this.cells_to_render) {
            this.renderCell(cell);
        }
        this.cells_to_render.clear();
    }

    renderCell(cell) {
        cell.state.render(this.ctx, cell, this.cell_size);
        if (cell.owner && cell.owner.living && cell.owner.isCallingAlarm) {
            const x = Math.round(cell.x);
            const y = Math.round(cell.y);
            const size = Math.round(this.cell_size);
            this.ctx.strokeStyle = 'rgba(255, 220, 80, 0.85)';
            this.ctx.lineWidth = Math.max(2, this.cell_size * 0.12);
            this.ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
        }
    }

    renderOrganism(org) {
        for (var org_cell of org.anatomy.cells) {
            var cell = org.getRealCell(org_cell);
            this.renderCell(cell);
        }
    }

    addToRender(cell) {
        if (this.highlighted_cells.has(cell)) {
            this.cells_to_highlight.add(cell);
        }
        this.cells_to_render.add(cell);
    }

    renderHighlights() {
        for (var cell of this.cells_to_highlight) {
            this.renderCellHighlight(cell);
            this.highlighted_cells.add(cell);
        }
        this.cells_to_highlight.clear();

    }

    renderSafeZone(zoneOrZones) {
        if (!zoneOrZones) return;
        const zones = Array.isArray(zoneOrZones) ? zoneOrZones : [zoneOrZones];
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(0, 180, 0, 0.12)';
        this.ctx.strokeStyle = 'rgba(0, 140, 0, 0.35)';
        this.ctx.lineWidth = Math.max(1, this.cell_size * 0.12);

        for (const zone of zones) {
            if (!zone) continue;
            const x = zone.cMin * this.cell_size;
            const y = zone.rMin * this.cell_size;
            const width = (zone.cMax - zone.cMin) * this.cell_size;
            const height = (zone.rMax - zone.rMin) * this.cell_size;
            this.ctx.fillRect(x, y, width, height);
            this.ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
        }

        this.ctx.restore();
    }

    highlightOrganism(org) {
        for (var org_cell of org.anatomy.cells) {
            var cell = org.getRealCell(org_cell);
            this.cells_to_highlight.add(cell);
        }
    }

    highlightCell(cell) {
        this.cells_to_highlight.add(cell);
    }

    renderCellHighlight(cell) {
        this.renderCell(cell);
        let color = 'yellow';
        if (cell.state.color === 'yellow') {
            color = 'red';
        }
        const x = Math.round(cell.x);
        const y = Math.round(cell.y);
        const size = Math.round(this.cell_size);
        this.ctx.fillStyle = color;
        this.ctx.strokeStyle = color;

        if (size <= 2) {
            // Small cells: fill entire cell
            this.ctx.fillRect(x, y, size, size);
        } else {
            // 1-pixel border entirely inside the cell
            this.ctx.fillRect(x, y, size, 1); // top
            this.ctx.fillRect(x, y + size - 1, size, 1); // bottom
            this.ctx.fillRect(x, y, 1, size); // left
            this.ctx.fillRect(x + size - 1, y, 1, size); // right
        }
        this.highlighted_cells.add(cell);
    }

    clearAllHighlights(clear_to_highlight = false) {
        for (var cell of this.highlighted_cells) {
            this.renderCell(cell);
        }
        this.highlighted_cells.clear();
        if (clear_to_highlight) {
            this.cells_to_highlight.clear();
        }
    }

    clearUpdates() {
        this.cells_to_render.clear();
        this.cells_to_highlight.clear();
        this.highlighted_cells.clear();
    }

    renderAlarmGlow(organisms) {
        this.ctx.save();
        this.ctx.globalAlpha = 0.8;
        this.ctx.fillStyle = 'rgba(255, 120, 40, 0.9)';

        for (const org of organisms) {
            if (!org.isCallingAlarm || !org.living) continue;
            for (const bodyCell of org.anatomy.cells) {
                const cell = org.getRealCell(bodyCell);
                if (!cell) continue;

                const x = Math.round(cell.x);
                const y = Math.round(cell.y);
                const size = Math.round(this.cell_size);
                this.ctx.fillRect(x, y, size, size);
            }
        }

        this.ctx.restore();
    }
}

module.exports = Renderer;
