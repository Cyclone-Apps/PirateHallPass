import { schoolMapSVG } from "../map.js";

export class MapController {
    /**
     * @param {Object} config 
     * @param {string} config.containerId - The ID of the div to inject the map into.
     * @param {string} config.mode - "student", "admin_restrict", or "proxy_pass"
     * @param {Function} config.onRoomSelect - Callback function when a room is clicked.
     */
    constructor(config) {
        this.containerId = config.containerId;
        this.mode = config.mode || "student";
        this.periodOverride = config.periodOverride || null; // 🌟 NEW: Allows time-traveling map
        this.onRoomSelect = config.onRoomSelect || function(){};
        
        this.container = document.getElementById(this.containerId);
        this.isZoomedIn = false;
        this.selectedRooms = config.selectedRooms || []; // Load previously restricted rooms
        this.currentSelection = null; // Used for standard pass

        this.init();
    }

    init() {
        if (!this.container) return;

        // 1. Inject the SVG map cleanly
        if (!this.container.querySelector("svg")) {
            this.container.innerHTML = schoolMapSVG;
        }

        this.svg = this.container.querySelector("svg");
        
        // Ensure starting constraints are perfect so it fits the screen exactly like the Admin view
        this.resetZoomView();

        // 2. Attach Zoom Listeners (If a zoom button exists in this view)
        const zoomGlass = this.container.parentElement.querySelector(".map-zoom-glass");
        if (zoomGlass) {
            zoomGlass.addEventListener("click", (e) => this.toggleZoom(e, zoomGlass));
        }

        // 3. Attach Node Click Listeners
        const mapNodes = this.svg.querySelectorAll(".map-node");
        mapNodes.forEach(node => {
            node.style.cursor = "pointer";
            node.addEventListener("click", (e) => this.handleNodeClick(e, node));
        });
    }

    handleNodeClick(e, node) {
        e.preventDefault();
        const roomId = node.getAttribute("data-id") || node.id || "";
        if (!roomId) return;

        // Filter out hallways for selection
        if (roomId.includes("Hallway") || roomId.includes("Corridor") || roomId.includes("Block")) return;

        if (this.mode === "admin_restrict") {
            // --- ADMIN RESTRICTION MODE ---
            if (this.selectedRooms.includes(roomId)) {
                this.selectedRooms = this.selectedRooms.filter(r => r !== roomId);
            } else {
                this.selectedRooms.push(roomId);
            }
            this.applyHighlights();
            this.onRoomSelect(this.selectedRooms); // Pass array back

        } else {
            // --- STUDENT OR PROXY MODE ---
            this.currentSelection = roomId;
            
            // Visual highlight
            this.svg.querySelectorAll(".map-node").forEach(n => n.classList.remove("selected"));
            this.svg.querySelectorAll(".zone-box").forEach(b => { b.style.stroke = ""; b.style.strokeWidth = ""; });
            
            if (this.mode === "student") {
                node.classList.add("selected");
            } else if (this.mode === "proxy_pass") {
                const activeBox = node.querySelector(".zone-box");
                if (activeBox) {
                    activeBox.style.stroke = "#2e7d32";
                    activeBox.style.strokeWidth = "3px";
                }
            }

            // Figure out teacher in the room
            const matchKey = roomId.toLowerCase().replace(/^room\s+/i, '').trim();
            const teacherName = this.getTeacherForRoom(matchKey);
            
            // Pass the single selection and teacher name back to the dashboard
            this.onRoomSelect({ room: roomId, teacher: teacherName });
        }
    }

    toggleZoom(e, zoomGlass) {
        e.preventDefault();
        e.stopPropagation();
        
        const iconText = zoomGlass.querySelector(".zoom-icon-text");
        this.container.style.overflow = "auto";
        this.svg.style.transition = "width 0.3s ease";

        if (this.isZoomedIn) {
            this.resetZoomView();
            if (iconText) iconText.textContent = "🔍+";
            this.hideTeacherNames();
            this.isZoomedIn = false;
        } else {
            // WE CLICKED PLUS -> ZOOM IN (Massive 1.5x Scale)
            this.container.style.display = "block"; // Allow native scrolling
            
            this.svg.style.maxWidth = "none";
            this.svg.style.maxHeight = "none";
            this.svg.removeAttribute("preserveAspectRatio");

            this.svg.style.width = "150vw";
            this.svg.style.height = "auto";
            
            if (iconText) iconText.textContent = "🔍-";
            this.showTeacherNames();
            
            setTimeout(() => {
                this.container.scrollLeft = (this.container.scrollWidth - this.container.clientWidth) / 2;
                this.container.scrollTop = (this.container.scrollHeight - this.container.clientHeight) / 2;
            }, 320);
            
            this.isZoomedIn = true;
        }
    }

    resetZoomView() {
        this.svg.style.width = "100%";
        this.svg.style.height = "100%";
        this.container.style.display = "flex";
        this.container.style.justifyContent = "center";
        this.container.style.alignItems = "center";
    }

    // --- REUSABLE UTILITIES INTEGRATED DIRECTLY ---

    applyHighlights() {
        const mapNodes = this.svg.querySelectorAll(".map-node");
        mapNodes.forEach(node => {
            const roomId = node.getAttribute("data-id");
            if(!roomId) return;
            const shape = node.querySelector(".zone-box, .corridor-box, path, rect, polygon") || node;
            
            if (this.selectedRooms.includes(roomId)) {
                shape.style.fill = "#ef1a14"; // Solid Pirate Red
                shape.style.opacity = "0.7";
            } else {
                shape.style.fill = ""; 
                shape.style.opacity = "1";
            }
        });
    }

    getTeacherForRoom(matchKey) {
        // 🌟 NEW: Use the override period if provided, otherwise fallback to right now
        let activePeriod = this.periodOverride; 
        
        if (!activePeriod) {
            activePeriod = "1"; 
            if (window.currentTimeState && window.currentTimeState.currentPeriod) {
                activePeriod = String(window.currentTimeState.currentPeriod);
            }
        }
        
        let currentDayNum = 1; 
        if (window.currentRotationDayText) {
            const parsed = parseInt(window.currentRotationDayText.replace(/\D/g, ''));
            if (!isNaN(parsed)) currentDayNum = parsed;
        }

        if (window.liveMasterSchedule && window.liveMasterSchedule[activePeriod]) {
            const assignments = window.liveMasterSchedule[activePeriod][matchKey];
            if (assignments && assignments.length > 0) {
                let activeTeacher = assignments.find(a => a.days.includes(currentDayNum));
                if (!activeTeacher) activeTeacher = assignments[0]; 
                return activeTeacher.teacher;
            }
        }
        return null;
    }

    showTeacherNames() {
        const mapNodes = this.svg.querySelectorAll(".map-node");
        mapNodes.forEach(node => {
            const dataId = node.getAttribute("data-id") || "";
            const matchKey = dataId.toLowerCase().replace(/^room\s+/i, '').trim();
            const teacherName = this.getTeacherForRoom(matchKey);

            if (teacherName) {
                const textEl = node.querySelector("text.lbl-room, text.lbl-large");
                if (textEl) {
                    if (!textEl.hasAttribute("data-orig-text")) {
                        textEl.setAttribute("data-orig-text", textEl.textContent);
                        textEl.setAttribute("data-orig-font", textEl.getAttribute("font-size") || "");
                        textEl.setAttribute("data-orig-fill", textEl.getAttribute("fill") || "");
                    }
                    textEl.textContent = teacherName;
                    textEl.setAttribute("fill", "#0277bd"); // Pirate Blue
                    textEl.setAttribute("font-size", teacherName.length > 12 ? "10" : "13");
                }
            }
        });
    }

    hideTeacherNames() {
        const mapNodes = this.svg.querySelectorAll(".map-node");
        mapNodes.forEach(node => {
            const textEl = node.querySelector("text.lbl-room, text.lbl-large");
            if (textEl && textEl.hasAttribute("data-orig-text")) {
                textEl.textContent = textEl.getAttribute("data-orig-text");
                const origFont = textEl.getAttribute("data-orig-font");
                const origFill = textEl.getAttribute("data-orig-fill");
                if (origFont) textEl.setAttribute("font-size", origFont);
                else textEl.removeAttribute("font-size");
                if (origFill) textEl.setAttribute("fill", origFill);
                else textEl.removeAttribute("fill");
            }
        });
    }
}