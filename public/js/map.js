// map.js
export const schoolMapSVG = `
<svg id="interactive-school-map" class="floorplan-svg" viewBox="-50 -20 1650 1200" preserveAspectRatio="xMidYMid meet" style="transition: all 0.4s ease-in-out;">
    <defs>
        <pattern id="hazard-stripes" width="20" height="20" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="20" stroke="#ffebee" stroke-width="20" />
            <line x1="10" y1="0" x2="10" y2="20" stroke="#ef9a9a" stroke-width="10" />
        </pattern>
    </defs>

    <rect class="parking-box" x="120" y="250" width="648" height="300" rx="8" />
    <text class="lbl-large" x="444" y="410" text-anchor="middle" style="fill:#bdbdbd;">OUTSIDE / PARKING</text>

    <g class="map-node" data-id="Elementary Office/Other" data-corridor="Outside"><rect class="zone-box" x="1100" y="20" width="220" height="50" rx="4"/><text class="lbl-room" x="1210" y="50" text-anchor="middle">Elem Office / Other</text></g>
    <g class="map-node" data-id="Nurse" data-corridor="Outside"><rect class="zone-box" x="1100" y="80" width="100" height="50" rx="4"/><text class="lbl-room" x="1150" y="110" text-anchor="middle">Nurse</text></g>
    <g class="map-node" data-id="Library" data-corridor="Outside"><rect class="zone-box" x="1220" y="80" width="100" height="50" rx="4"/><text class="lbl-room" x="1270" y="110" text-anchor="middle">Library</text></g>

    <g class="map-node" data-id="Room 112" data-corridor="100 Hallway"><rect class="zone-box" x="0" y="0" width="120" height="250" rx="4"/><text class="lbl-room" x="60" y="130" text-anchor="middle">112</text></g>
    <g class="map-node" data-id="100 Hallway"><rect class="corridor-box" x="120" y="100" width="768" height="50" rx="4"/><text class="lbl-room" x="504" y="130" text-anchor="middle">100 HALLWAY</text></g>

    <g class="map-node" data-id="Room 110" data-corridor="100 Hallway"><rect class="zone-box" x="120" y="0" width="120" height="100" rx="4"/><text class="lbl-room" x="180" y="55" text-anchor="middle">110</text></g>
    <g class="map-node" data-id="Room 108" data-corridor="100 Hallway"><rect class="zone-box" x="240" y="0" width="120" height="100" rx="4"/><text class="lbl-room" x="300" y="55" text-anchor="middle">108</text></g>
    <g class="map-node" data-id="Room 106" data-corridor="100 Hallway"><rect class="zone-box" x="360" y="0" width="120" height="100" rx="4"/><text class="lbl-room" x="420" y="55" text-anchor="middle">106</text></g>
    <g class="map-node" data-id="Room 104" data-corridor="100 Hallway"><rect class="zone-box" x="480" y="0" width="120" height="100" rx="4"/><text class="lbl-room" x="540" y="55" text-anchor="middle">104</text></g>
    <g class="map-node" data-id="Room 102" data-corridor="100 Hallway"><rect class="zone-box" x="600" y="0" width="120" height="100" rx="4"/><text class="lbl-room" x="660" y="55" text-anchor="middle">102</text></g>
    <g class="map-node" data-id="Room 100B" data-corridor="100 Hallway"><rect class="zone-box" x="720" y="0" width="48" height="100" rx="4"/><text class="lbl-room" x="744" y="55" text-anchor="middle">100B</text></g>
    <g class="map-node" data-id="Room 100" data-corridor="100 Hallway"><rect class="zone-box" x="768" y="0" width="120" height="100" rx="4"/><text class="lbl-room" x="828" y="55" text-anchor="middle">100</text></g>

    <g class="map-node" data-id="HS Office" data-corridor="100 Hallway"><rect class="zone-box" x="888" y="0" width="150" height="50" rx="4"/><text class="lbl-room" x="963" y="30" text-anchor="middle">HS Office</text></g>
    <g class="map-node" data-id="Main Entrance" data-corridor="100 Hallway"><path class="zone-box" d="M 888,50 L 1038,50 L 1038,150 L 938,150 L 938,100 L 888,100 Z" /><text class="lbl-room" x="975" y="85" text-anchor="middle">Entrance</text></g>

    <g class="map-node" data-id="Room 107" data-corridor="100 Hallway"><rect class="zone-box" x="120" y="150" width="130" height="100" rx="4"/><text class="lbl-room" x="185" y="205" text-anchor="middle">107</text></g>
    <g class="map-node" data-id="Hallway Down 1"><rect class="corridor-box" x="250" y="150" width="50" height="100" rx="4"/></g>
    <g class="map-node" data-id="Room 103" data-corridor="100 Hallway"><rect class="zone-box" x="300" y="150" width="180" height="100" rx="4"/><text class="lbl-room" x="390" y="205" text-anchor="middle">103</text></g>
    <g class="map-node" data-id="Room 101" data-corridor="100 Hallway"><rect class="zone-box" x="480" y="150" width="180" height="100" rx="4"/><text class="lbl-room" x="570" y="205" text-anchor="middle">101</text></g>
    <g class="map-node" data-id="Custodial" data-corridor="100 Hallway"><rect class="zone-box" x="660" y="150" width="84" height="100" rx="4"/><text class="lbl-room" x="702" y="205" text-anchor="middle">Cust.</text></g>
    
    <g class="map-node" data-id="Girls Restroom 100s" data-corridor="100 Hallway"><rect class="zone-box" x="744" y="150" width="60" height="100" rx="4"/><text class="lbl-room" x="774" y="205" text-anchor="middle">G-RR</text></g>
    <g class="map-node" data-id="Mechanical" data-corridor="100 Hallway"><rect class="zone-box" x="804" y="150" width="84" height="50" rx="4"/><text class="lbl-room" x="846" y="180" text-anchor="middle">Mech.</text></g>
    <g class="map-node" data-id="Boys Restroom 100s" data-corridor="100 Hallway"><rect class="zone-box" x="804" y="200" width="84" height="50" rx="4"/><text class="lbl-room" x="846" y="230" text-anchor="middle">B-RR</text></g>

    <g class="map-node" data-id="Room 109" data-corridor="100 Hallway"><rect class="zone-box" x="0" y="250" width="250" height="100" rx="4"/><text class="lbl-room" x="125" y="305" text-anchor="middle">109</text></g>
    <g class="map-node" data-id="Room 105" data-corridor="100 Hallway"><rect class="zone-box" x="300" y="250" width="90" height="100" rx="4"/><text class="lbl-room" x="345" y="305" text-anchor="middle">105</text></g>

    <g class="map-node" data-id="Main Vertical Hall"><rect class="corridor-box" x="888" y="100" width="50" height="700" rx="4"/></g>

    <g class="map-node" data-id="Room 200" data-corridor="Main Vertical Hall"><rect class="zone-box" x="768" y="250" width="120" height="100" rx="4"/><text class="lbl-room" x="828" y="305" text-anchor="middle">200</text></g>
    <g class="map-node" data-id="Room 202" data-corridor="Main Vertical Hall"><rect class="zone-box" x="768" y="350" width="120" height="100" rx="4"/><text class="lbl-room" x="828" y="405" text-anchor="middle">202</text></g>
    <g class="map-node" data-id="Mechanical 2" data-corridor="Main Vertical Hall"><rect class="zone-box" x="768" y="450" width="120" height="100" rx="4"/><text class="lbl-room" x="828" y="505" text-anchor="middle">Mech</text></g>

    <g class="map-node" data-id="District Office" data-corridor="Main Vertical Hall"><rect class="zone-box" x="938" y="150" width="120" height="150" rx="4"/><text class="lbl-room" x="998" y="230" text-anchor="middle">Dist. Off.</text></g>
    <g class="map-node" data-id="Room 201A" data-corridor="Main Vertical Hall"><rect class="zone-box" x="938" y="300" width="120" height="50" rx="4"/><text class="lbl-room" x="998" y="330" text-anchor="middle">201A</text></g>
    <g class="map-node" data-id="Room 201" data-corridor="Main Vertical Hall"><rect class="zone-box" x="938" y="350" width="120" height="100" rx="4"/><text class="lbl-room" x="998" y="405" text-anchor="middle">201</text></g>
    <g class="map-node" data-id="Restroom 200s" data-corridor="Main Vertical Hall"><rect class="zone-box" x="938" y="450" width="120" height="100" rx="4"/><text class="lbl-room" x="998" y="505" text-anchor="middle">RR</text></g>
    
    <g class="map-node" data-id="Cross Corridor Block"><rect class="corridor-box" x="888" y="550" width="340" height="30" rx="4"/></g>

    <g class="map-node" data-id="Gym Lobby" data-corridor="Cross Corridor Block"><rect class="zone-box" x="1058" y="450" width="170" height="100" rx="4"/><text class="lbl-room" x="1143" y="505" text-anchor="middle">Gym Lobby</text></g>

    <g class="map-node" data-id="Girls Locker Room" data-corridor="Main Vertical Hall"><rect class="zone-box" x="938" y="580" width="192" height="100" rx="4"/><text class="lbl-room" x="1034" y="635" text-anchor="middle">Girls Locker Room</text></g>
    <g class="map-node" data-id="LR Office" data-corridor="Main Vertical Hall"><rect class="zone-box" x="1130" y="580" width="48" height="100" rx="4"/><text class="lbl-room" x="1154" y="630" text-anchor="middle" transform="rotate(-90 1154 630)">LR Office</text></g>
    
    <g class="map-node" data-id="Locker Room Mid Corridor"><rect class="corridor-box" x="938" y="680" width="240" height="20" rx="2"/></g>
    
    <g class="map-node" data-id="Boys Locker Room" data-corridor="Main Vertical Hall"><rect class="zone-box" x="938" y="700" width="192" height="100" rx="4"/><text class="lbl-room" x="1034" y="755" text-anchor="middle">Boys Locker Room</text></g>
    <g class="map-node" data-id="Trainer's Office" data-corridor="Main Vertical Hall"><rect class="zone-box" x="1130" y="700" width="48" height="100" rx="4"/><text class="lbl-room" x="1154" y="750" text-anchor="middle" transform="rotate(-90 1154 750)">Trainer's</text></g>

    <g class="map-node" data-id="300 Hallway"><rect class="corridor-box" x="160" y="650" width="728" height="50" rx="4"/><text class="lbl-room" x="524" y="680" text-anchor="middle">300 HALLWAY</text></g>

    <g class="map-node" data-id="Room 312" data-corridor="300 Hallway"><rect class="zone-box" x="100" y="550" width="150" height="100" rx="4"/><text class="lbl-room" x="175" y="605" text-anchor="middle">312</text></g>
    <g class="map-node" data-id="Room 310" data-corridor="300 Hallway"><rect class="zone-box" x="250" y="550" width="95" height="100" rx="4"/><text class="lbl-room" x="297.5" y="605" text-anchor="middle">310</text></g>
    <g class="map-node" data-id="Room 308" data-corridor="300 Hallway"><rect class="zone-box" x="345" y="550" width="85" height="100" rx="4"/><text class="lbl-room" x="387.5" y="605" text-anchor="middle">308</text></g>
    <g class="map-node" data-id="Room 306" data-corridor="300 Hallway"><rect class="zone-box" x="430" y="550" width="85" height="100" rx="4"/><text class="lbl-room" x="472.5" y="605" text-anchor="middle">306</text></g>
    <g class="map-node" data-id="Room 304" data-corridor="300 Hallway"><rect class="zone-box" x="515" y="550" width="85" height="100" rx="4"/><text class="lbl-room" x="557.5" y="605" text-anchor="middle">304</text></g>
    <g class="map-node" data-id="Room 302" data-corridor="300 Hallway"><rect class="zone-box" x="600" y="550" width="85" height="100" rx="4"/><text class="lbl-room" x="642.5" y="605" text-anchor="middle">302</text></g>
    <g class="map-node" data-id="Room 300C" data-corridor="300 Hallway"><rect class="zone-box" x="685" y="550" width="90" height="100" rx="4"/><text class="lbl-room" x="730" y="605" text-anchor="middle">300C</text></g>
    <g class="map-node" data-id="Room 300B" data-corridor="300 Hallway"><rect class="zone-box" x="775" y="550" width="64" height="100" rx="4"/><text class="lbl-room" x="807" y="605" text-anchor="middle">300B</text></g>
    <g class="map-node" data-id="Room 300A" data-corridor="300 Hallway"><rect class="zone-box" x="839" y="550" width="49" height="100" rx="4"/><text class="lbl-room" x="863.5" y="605" text-anchor="middle">300A</text></g>

    <g class="map-node" data-id="Restroom 300s" data-corridor="300 Hallway"><rect class="zone-box" x="100" y="650" width="60" height="150" rx="4"/><text class="lbl-room" x="130" y="730" text-anchor="middle">RR</text></g>
    <g class="map-node" data-id="Exit Hall 300s"><rect class="corridor-box" x="160" y="650" width="25" height="150" rx="2"/></g>
    <g class="map-node" data-id="Mechanical 3" data-corridor="300 Hallway"><rect class="zone-box" x="185" y="700" width="65" height="100" rx="4"/><text class="lbl-room" x="217.5" y="755" text-anchor="middle">Mech</text></g>
    
    <g class="map-node" data-id="Room 313" data-corridor="300 Hallway"><rect class="zone-box" x="250" y="700" width="95" height="100" rx="4"/><text class="lbl-room" x="297.5" y="755" text-anchor="middle">313</text></g>
    <g class="map-node" data-id="Room 311" data-corridor="300 Hallway"><rect class="zone-box" x="345" y="700" width="85" height="100" rx="4"/><text class="lbl-room" x="387.5" y="755" text-anchor="middle">311</text></g>
    <g class="map-node" data-id="Room 309" data-corridor="300 Hallway"><rect class="zone-box" x="430" y="700" width="85" height="100" rx="4"/><text class="lbl-room" x="472.5" y="755" text-anchor="middle">309</text></g>
    <g class="map-node" data-id="Room 307" data-corridor="300 Hallway"><rect class="zone-box" x="515" y="700" width="85" height="100" rx="4"/><text class="lbl-room" x="557.5" y="755" text-anchor="middle">307</text></g>
    <g class="map-node" data-id="Room 305" data-corridor="300 Hallway"><rect class="zone-box" x="600" y="700" width="85" height="100" rx="4"/><text class="lbl-room" x="642.5" y="755" text-anchor="middle">305</text></g>
    <g class="map-node" data-id="Room 303" data-corridor="300 Hallway"><rect class="zone-box" x="685" y="700" width="90" height="100" rx="4"/><text class="lbl-room" x="730" y="755" text-anchor="middle">303</text></g>
    <g class="map-node" data-id="Room 301" data-corridor="300 Hallway"><rect class="zone-box" x="775" y="700" width="64" height="100" rx="4"/><text class="lbl-room" x="807" y="755" text-anchor="middle">301</text></g>
    <g class="map-node" data-id="Guidance" data-corridor="300 Hallway"><rect class="zone-box" x="839" y="700" width="49" height="100" rx="4"/><text class="lbl-room" x="863.5" y="755" text-anchor="middle">Guid.</text></g>

    <g class="map-node" data-id="Gym Vertical Hall"><rect class="corridor-box" x="1178" y="580" width="50" height="220" rx="4"/></g>

    <g class="map-node" data-id="Main Gym" data-corridor="Cross Corridor Block"><rect class="zone-box" x="1228" y="250" width="270" height="450" rx="4"/><text class="lbl-large" x="1363" y="485" text-anchor="middle">MAIN GYM</text></g>

    <g class="map-node" data-id="Band Room" data-corridor="Fine Arts Corridor"><rect class="zone-box" x="1228" y="700" width="90" height="100" rx="4"/><text class="lbl-room" x="1273" y="755" text-anchor="middle">Band</text></g>
    <g class="map-node" data-id="Vocal Music" data-corridor="Fine Arts Corridor"><rect class="zone-box" x="1318" y="700" width="90" height="100" rx="4"/><text class="lbl-room" x="1363" y="755" text-anchor="middle">Vocal</text></g>
    <g class="map-node" data-id="NICC" data-corridor="Fine Arts Corridor"><rect class="zone-box" x="1408" y="700" width="90" height="100" rx="4"/><text class="lbl-room" x="1453" y="755" text-anchor="middle">NICC</text></g>

    <g class="map-node" data-id="Fine Arts Corridor"><rect class="corridor-box" x="685" y="800" width="813" height="40" rx="4"/><text class="lbl-room" x="1091" y="825" text-anchor="middle">ACTIVITY HALLWAY</text></g>

    <g class="map-node" data-id="Room 400" data-corridor="Fine Arts Corridor"><rect class="zone-box" x="685" y="840" width="154" height="120" rx="4"/><text class="lbl-room" x="762" y="905" text-anchor="middle">400 Weight Rm</text></g>
    <g class="map-node" data-id="Room 401" data-corridor="Fine Arts Corridor"><rect class="zone-box" x="839" y="840" width="389" height="120" rx="4"/><text class="lbl-room" x="1033" y="905" text-anchor="middle">401 Weight Rm</text></g>
    
    <g class="map-node" data-id="Auditorium" data-corridor="Fine Arts Corridor"><rect class="zone-box" x="1228" y="840" width="180" height="260" rx="4"/><text class="lbl-large" x="1318" y="980" text-anchor="middle">AUDITORIUM</text></g>
    <g class="map-node" data-id="Auditorium Lobby" data-corridor="Fine Arts Corridor"><rect class="zone-box" x="1408" y="840" width="90" height="195" rx="4"/><text class="lbl-room" x="1453" y="937.5" text-anchor="middle">Aud Lobby</text></g>
    <g class="map-node" data-id="Auditorium RR" data-corridor="Fine Arts Corridor"><rect class="zone-box" x="1408" y="1035" width="90" height="65" rx="4"/><text class="lbl-room" x="1453" y="1067.5" text-anchor="middle">Aud RR</text></g>

    <g class="map-node" data-id="312/RR Fountain" data-corridor="Exit Hall 300s"><rect class="zone-box" x="157.5" y="735" width="30" height="30" rx="15"/><text class="lbl-room" x="172.5" y="756" font-size="18" text-anchor="middle">🚰</text></g>
    <g class="map-node" data-id="108 Fountain" data-corridor="100 Hallway"><rect class="zone-box" x="315" y="110" width="30" height="30" rx="15"/><text class="lbl-room" x="330" y="131" font-size="18" text-anchor="middle">🚰</text></g>
    <g class="map-node" data-id="HS Office Fountain" data-corridor="Main Vertical Hall"><rect class="zone-box" x="898" y="210" width="30" height="30" rx="15"/><text class="lbl-room" x="913" y="231" font-size="18" text-anchor="middle">🚰</text></g>
    <g class="map-node" data-id="Guidance Drinking Fountain" data-corridor="Main Vertical Hall"><rect class="zone-box" x="898" y="585" width="30" height="30" rx="15"/><text class="lbl-room" x="913" y="606" font-size="18" text-anchor="middle">🚰</text></g>
    <g class="map-node" data-id="Band Room Fountain" data-corridor="Gym Vertical Hall"><rect class="zone-box" x="1188" y="735" width="30" height="30" rx="15"/><text class="lbl-room" x="1203" y="756" font-size="18" text-anchor="middle">🚰</text></g>
    <g class="map-node" data-id="Gym Lobby Fountain" data-corridor="Gym Lobby"><rect class="zone-box" x="1063" y="455" width="30" height="30" rx="15"/><text class="lbl-room" x="1078" y="476" font-size="18" text-anchor="middle">🚰</text></g>
    <g class="map-node" data-id="Auditorium Lobby Fountain" data-corridor="Auditorium Lobby"><rect class="zone-box" x="1438" y="845" width="30" height="30" rx="15"/><text class="lbl-room" x="1453" y="866" font-size="18" text-anchor="middle">🚰</text></g>
    <g class="map-node" data-id="Office Vending" data-corridor="Main Entrance"><rect class="zone-box" x="1003" y="115" width="30" height="30" rx="15"/><text class="lbl-room" x="1018" y="136" font-size="18" text-anchor="middle">🥤</text></g>
    <g class="map-node" data-id="Gym Lobby Vending" data-corridor="Gym Lobby"><rect class="zone-box" x="1063" y="515" width="30" height="30" rx="15"/><text class="lbl-room" x="1078" y="536" font-size="18" text-anchor="middle">🥤</text></g>

    <g class="map-zoom-glass" transform="translate(380, 336)" style="cursor: pointer;">
        <rect width="128" height="128" rx="64" fill="white" stroke="var(--pirate-red)" stroke-width="4" />
        <text class="zoom-icon-text" x="64" y="84" font-size="64" font-weight="bold" fill="var(--pirate-red)" text-anchor="middle">🔍+</text>
    </g>

</svg>
`;