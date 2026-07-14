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
        this.periodOverride = config.periodOverride || null; 
        this.onRoomSelect = config.onRoomSelect || function(){};

        this.selectedRooms = config.selectedRooms || []; 
        this.capacityLimits = config.capacityLimits || {}; 
        this.currentSelection = null; 
        
        this.container = document.getElementById(this.containerId);
        this.isZoomedIn = false;
        this.selectedRooms = config.selectedRooms || []; 
        this.currentSelection = null; 

        this.init();
    }

    init() {
        if (!this.container) return;

        if (!this.container.querySelector("svg")) {
            this.container.innerHTML = schoolMapSVG;
        }

        this.svg = this.container.querySelector("svg");
        this.resetZoomView();

        const zoomGlass = this.container.parentElement.querySelector(".map-zoom-glass");
        if (zoomGlass) {
            zoomGlass.addEventListener("click", (e) => this.toggleZoom(e, zoomGlass));
        }

        const mapNodes = this.svg.querySelectorAll(".map-node");
        mapNodes.forEach(node => {
            node.style.cursor = "pointer";
            node.addEventListener("click", (e) => this.handleNodeClick(e, node));
        });

        this.applyHighlights(); 
    }

    handleNodeClick(e, node) {
        e.preventDefault();
        const roomId = node.getAttribute("data-id") || node.id || "";
        if (!roomId) return;

        if (roomId.includes("Hallway") || roomId.includes("Corridor") || roomId.includes("Block")) return;

        if (this.mode === "admin_restrict") {
            if (this.selectedRooms.includes(roomId)) {
                this.selectedRooms = this.selectedRooms.filter(r => r !== roomId);
            } else {
                this.selectedRooms.push(roomId);
            }
            this.applyHighlights();
            this.onRoomSelect(this.selectedRooms); 

        } else if (this.mode === "admin_capacity") { 
            this.onRoomSelect({ room: roomId });

        } else {
            this.currentSelection = roomId;
            
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

            const matchKey = roomId.toLowerCase().replace(/^room\s+/i, '').trim();
            const teacherName = this.getTeacherForRoom(matchKey);
            
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
            this.container.style.display = "block"; 
            
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

    applyHighlights() {
        const mapNodes = this.svg.querySelectorAll(".map-node");
        
        this.svg.querySelectorAll(".capacity-label").forEach(el => el.remove());

        mapNodes.forEach(node => {
            const roomId = node.getAttribute("data-id");
            if(!roomId) return;
            const shape = node.querySelector(".zone-box, .corridor-box, path, rect, polygon") || node;
            
            if (this.mode === "admin_restrict") {
                if (this.selectedRooms.includes(roomId)) {
                    shape.style.fill = "#ef1a14"; 
                    shape.style.opacity = "0.7";
                } else {
                    shape.style.fill = ""; 
                    shape.style.opacity = "1";
                }
            }
            else if (this.mode === "admin_capacity") {
                if (this.capacityLimits[roomId] !== undefined) {
                    shape.style.fill = "#ef1a14"; 
                    shape.style.opacity = "0.7";

                    const bbox = shape.getBBox(); 
                    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    text.classList.add("capacity-label");
                    
                    text.setAttribute("x", bbox.x + bbox.width / 2);
                    text.setAttribute("y", bbox.y + bbox.height - 4); 
                    
                    text.setAttribute("text-anchor", "middle");
                    text.setAttribute("fill", "white");
                    text.setAttribute("font-size", "14px");
                    text.setAttribute("font-weight", "bold");
                    text.setAttribute("pointer-events", "none"); 
                    
                    text.textContent = `Limit: ${this.capacityLimits[roomId]}`;
                    node.appendChild(text);
                } else {
                    shape.style.fill = ""; 
                    shape.style.opacity = "1";
                }
            }
        });
    }

    getTeacherForRoom(matchKey) {
        let rawName = null;

        const scheduleData = window.liveMasterSchedule || window.currentLiveScheduleData;

        // 1st Priority - Is this room permanently locked?
        if (scheduleData && scheduleData.lockedRooms && scheduleData.lockedRooms[matchKey]) {
            rawName = scheduleData.lockedRooms[matchKey];
        } 
        // 2nd Priority - Normal schedule check
        else {
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

            if (scheduleData && scheduleData[activePeriod]) {
                const assignments = scheduleData[activePeriod][matchKey];
                if (assignments && assignments.length > 0) {
                    let activeTeacher = assignments.find(a => a.days.includes(currentDayNum));
                    if (!activeTeacher) activeTeacher = assignments[0]; 
                    rawName = activeTeacher.teacher;
                }
            }
        }

        if (!rawName) return null;

        // ==========================================
        // 🧠 NEW: DYNAMIC TEACHER LOOKUP
        // ==========================================
        const staffList = window.activeStaffList || [];
        const rawLower = rawName.toLowerCase().trim();
        
        // Find the user by checking if the raw schedule name includes their last name
        const matchedStaff = staffList.find(staff => {
            const lName = (staff.lastName || "").toLowerCase().trim();
            const dName = (staff.displayName || "").toLowerCase().trim();
            return (lName && rawLower.includes(lName)) || (dName && rawLower === dName);
        });

        if (matchedStaff && matchedStaff.mapName && matchedStaff.mapName.trim() !== "") {
            return matchedStaff.mapName.trim();
        }

        return rawName.trim();
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