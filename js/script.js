var ws = null;

function webreplConnect(url, password) {
    ws = new WebSocket(url);
    ws.onopen = function () {
        ws.onmessage = function () { };
        ws.send(password + '\r\n');
        ws.send('\x03');
        updateStatus();
    };
    ws.onclose = function () { ws = null; updateStatus(); };
    ws.onerror = function () { updateStatus(); };
}

function hex2rgb(hex, w) {
    hex = hex.slice(1);
    var bigint = parseInt(hex, 16);
    var r = (bigint >> 16) & 255;
    var g = (bigint >> 8) & 255;
    var b = bigint & 255;
    return '(' + [g, r, b, w].join() + ')';
}

function updateStatus() {
    var el = document.getElementById('status');
    if (!ws || ws.readyState === WebSocket.CLOSED) {
        el.textContent = "Closed";
    } else if (ws.readyState === WebSocket.OPEN) {
        el.textContent = "Open";
    } else if (ws.readyState === WebSocket.CONNECTING) {
        el.textContent = "Connecting";
    } else {
        el.textContent = "Closing";
    }
}

function initSideControls() {
    document.querySelectorAll('.side-control').forEach(function (control) {
        var cardinal = control.dataset.cardinal;
        var axis = control.dataset.axis;
        var colorInput = control.querySelector('input[type="color"]');
        var whiteDiv = control.querySelector('.side-control-white');
        var wInput = document.getElementById('w' + cardinal);
        var dragging = false;
        var moved = false;
        var startX, startY;

        function updateWhite(value) {
            wInput.value = value;
            var pct = (value / 255) * 100 + '%';
            if (axis === 'x') {
                whiteDiv.style.width = pct;
            } else {
                whiteDiv.style.height = pct;
            }
        }

        function getValueFromEvent(e) {
            var rect = control.getBoundingClientRect();
            var value;
            if (axis === 'x') {
                value = Math.round(((e.clientX - rect.left) / rect.width) * 255);
            } else {
                value = Math.round(((rect.bottom - e.clientY) / rect.height) * 255);
            }
            return Math.max(0, Math.min(255, value));
        }

        control.addEventListener('pointerdown', function (e) {
            dragging = true;
            moved = false;
            startX = e.clientX;
            startY = e.clientY;
            control.setPointerCapture(e.pointerId);
            e.preventDefault();
        });

        control.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            var dx = e.clientX - startX;
            var dy = e.clientY - startY;
            if (dx * dx + dy * dy > 25) moved = true;
            if (moved) updateWhite(getValueFromEvent(e));
        });

        control.addEventListener('pointerup', function (e) {
            if (!moved) {
                if (colorInput.showPicker) {
                    colorInput.showPicker();
                } else {
                    colorInput.click();
                }
            }
            dragging = false;
            moved = false;
        });

        updateWhite(parseInt(wInput.value));
    });
}

function wsSend(msg) {
    console.log(msg);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
}

function connect() {
    if (ws) ws.close();
    var boardURL = document.getElementById('boardURL').value;
    var password = document.getElementById('password').value;
    webreplConnect(boardURL, password);
}

function updateColor(object) {
    var direction = "";
    if (object.id === "rgbnorth") direction = "to top";
    else if (object.id === "rgbeast") direction = "to right";
    else if (object.id === "rgbsouth") direction = "to bottom";
    else if (object.id === "rgbwest") direction = "to left";
    var colorDiv = object.closest('.side-control').querySelector('.side-control-color');
    colorDiv.style.backgroundImage = "linear-gradient(" + direction + "," + object.value + ", rgba(0,0,0,0))";
}

function powerPlug(power) {
    var xhr = new XMLHttpRequest();
    var url = document.getElementById('plugURL').value + 'cm?cmnd=Power ' + power;
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            document.getElementById('plugStatus').textContent = xhr.responseText;
        }
    };
    xhr.open("GET", url, true);
    xhr.send();
}

function getColor(cardinal) {
    return hex2rgb(document.getElementById('rgb' + cardinal).value, parseInt(document.getElementById('w' + cardinal).value));
}

function parseAndExec(text) {
    var n = getColor('north');
    var e = getColor('east');
    var s = getColor('south');
    var w = getColor('west');
    var f = parseFloat(document.getElementById('frequency').value);
    var i = parseFloat(document.getElementById('index').value);
    var fn = text
        .replace('{north}', n)
        .replace('{east}', e)
        .replace('{south}', s)
        .replace('{west}', w)
        .replace('{frequency}', f)
        .replace('{index}', i);
    wsSend('paris.stop_timer()\r\n');
    wsSend('paris.' + fn + '\r\n');
}

function toggleCollapse(id) {
    var el = document.getElementById(id);
    if (el.style.display === 'none' || el.style.display === '') {
        el.style.display = 'block';
    } else {
        el.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', function () {
    updateStatus();

    document.getElementById('password').value = 'pvris';
    document.getElementById('password').addEventListener('keypress', function (event) {
        if (event.key === 'Enter') connect();
    });

    document.getElementById('open').addEventListener('click', connect);
    document.getElementById('close').addEventListener('click', function () { if (ws) { ws.close(); ws = null; } });

    document.getElementById('toggle-dynamic').addEventListener('click', function () { toggleCollapse('collapseDynamic'); });
    document.getElementById('toggle-tests').addEventListener('click', function () { toggleCollapse('collapseTests'); });

    document.querySelectorAll('.code-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { parseAndExec(this.textContent); });
    });

    document.getElementById('btn-solunar').addEventListener('click', function () {
        wsSend('paris.run_solunar()\r\n');
    });

    document.getElementById('btn-clock').addEventListener('click', function () {
        var continuous = document.getElementById('clk_continuous').checked ? 'True' : 'False';
        wsSend('paris.run_cls_clock(' + continuous + ')\r\n');
    });

    document.getElementById('btn-clock2').addEventListener('click', function () {
        var start_at_minute = document.getElementById('clk_start_at_minute').checked ? 'True' : 'False';
        var two_colors = document.getElementById('clk_two_colors').checked ? 'True' : 'False';
        var ambient = document.getElementById('clk_ambient').checked ? 'True' : 'False';
        wsSend('paris.run_neo_clock(' + start_at_minute + ',' + two_colors + ',' + ambient + ')\r\n');
    });

    document.getElementById('btn-ambient').addEventListener('click', function () {
        wsSend('paris.stop_timer()\r\n');
        wsSend('paris.ambient()\r\n');
    });

    document.getElementById('btn-focus').addEventListener('click', function () {
        wsSend('paris.stop_timer()\r\n');
        wsSend('paris.set_sides((0,32,127,0),(0,32,127,0),(0,0,0,127),(0,32,127,0),False)\r\n');
    });

    document.getElementById('btn-vertical').addEventListener('click', function () {
        var fn = 'set_sides(' + getColor('north') + ',(0,0,0,0),' + getColor('south') + ',(0,0,0,0),True)';
        wsSend('paris.stop_timer()\r\n');
        wsSend('paris.' + fn + '\r\n');
    });

    document.getElementById('btn-horizontal').addEventListener('click', function () {
        var fn = 'set_sides((0,0,0,0),' + getColor('east') + ',(0,0,0,0),' + getColor('west') + ',True)';
        wsSend('paris.stop_timer()\r\n');
        wsSend('paris.' + fn + '\r\n');
    });

    document.getElementById('btn-circle').addEventListener('click', function () {
        wsSend('paris.stop_timer()\r\n');
        parseAndExec('set_sides({north},{east},{south},{west},False)');
    });

    document.getElementById('btn-square').addEventListener('click', function () {
        wsSend('paris.stop_timer()\r\n');
        parseAndExec('set_sides({north},{east},{south},{west},True)');
    });

    document.getElementById('btn-sleep').addEventListener('click', function () {
        wsSend('paris.stop_timer()\r\n');
        wsSend('paris.off()\r\n');
    });

    document.getElementById('btn-larson').addEventListener('click', function () {
        parseAndExec('run_larson_scanner(\'south\',(0,255,0,0),(0,0,0,0))');
    });

    document.getElementById('btn-spin').addEventListener('click', function () {
        parseAndExec('run_spin({north},{frequency})');
    });

    document.getElementById('dimmer').addEventListener('change', function (e) {
        wsSend('paris.apply_dimmer(' + e.target.value + ')\r\n');
    });

    initSideControls();

    ['rgbnorth', 'rgbeast', 'rgbsouth', 'rgbwest'].forEach(function (id) {
        var picker = document.getElementById(id);
        updateColor(picker);
        picker.addEventListener('change', function () { updateColor(this); });
    });
});

