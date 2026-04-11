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
    var el = document.querySelector('#status');
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

function resizeVerticalSliders() {
    ['#wwest', '#weast'].forEach(function (sel) {
        var slider = document.querySelector(sel);
        var parent = slider.parentElement;
        var pw = parent.offsetWidth;
        var ph = parent.offsetHeight;
        slider.style.width = ph + 'px';
        slider.style.height = pw + 'px';
        slider.style.left = (pw / 2 - ph / 2) + 'px';
        slider.style.top = (ph / 2 - pw / 2) + 'px';
    });
}

function wsSend(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
}

function connect() {
    if (ws) ws.close();
    var boardURL = document.querySelector('#boardURL').value;
    var password = document.querySelector('#password').value;
    webreplConnect(boardURL, password);
}

function updateColor(object) {
    var direction = "";
    if (object.id === "rgbnorth") direction = "to top";
    else if (object.id === "rgbeast") direction = "to right";
    else if (object.id === "rgbsouth") direction = "to bottom";
    else if (object.id === "rgbwest") direction = "to left";
    object.parentElement.style.backgroundImage = "linear-gradient(" + direction + "," + object.value + ", rgba(0,0,0,0))";
}

function powerPlug(power) {
    var xhr = new XMLHttpRequest();
    var url = document.querySelector('#plugURL').value + 'cm?cmnd=Power ' + power;
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            document.querySelector('#plugStatus').textContent = xhr.responseText;
        }
    };
    xhr.open("GET", url, true);
    xhr.send();
}

function getColor(cardinal) {
    return hex2rgb(document.querySelector('#rgb' + cardinal).value, parseInt(document.querySelector('#w' + cardinal).value));
}

function parseAndExec(text) {
    var n = getColor('north');
    var e = getColor('east');
    var s = getColor('south');
    var w = getColor('west');
    var f = parseFloat(document.querySelector('#frequency').value);
    var i = parseFloat(document.querySelector('#index').value);
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

    document.querySelector('#password').value = 'pvris';
    document.querySelector('#password').addEventListener('keypress', function (event) {
        if (event.key === 'Enter') connect();
    });

    document.querySelector('#open').addEventListener('click', connect);
    document.querySelector('#close').addEventListener('click', function () { if (ws) { ws.close(); ws = null; } });

    connect();

    document.querySelector('#toggle-dynamic').addEventListener('click', function () { toggleCollapse('collapseDynamic'); });
    document.querySelector('#toggle-tests').addEventListener('click', function () { toggleCollapse('collapseTests'); });

    document.querySelectorAll('.code-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { parseAndExec(this.textContent); });
    });

    document.querySelector('#btn-solunar').addEventListener('click', function () {
        wsSend('paris.run_solunar()\r\n');
    });

    document.querySelector('#btn-clock').addEventListener('click', function () {
        var continuous = document.querySelector('#clk_continuous').checked ? 'True' : 'False';
        wsSend('paris.run_cls_clock(' + continuous + ')\r\n');
    });

    document.querySelector('#btn-clock2').addEventListener('click', function () {
        var start_at_minute = document.querySelector('#clk_start_at_minute').checked ? 'True' : 'False';
        var two_colors = document.querySelector('#clk_two_colors').checked ? 'True' : 'False';
        var ambient = document.querySelector('#clk_ambient').checked ? 'True' : 'False';
        wsSend('paris.run_neo_clock(' + start_at_minute + ',' + two_colors + ',' + ambient + ')\r\n');
    });

    document.querySelector('#btn-ambient').addEventListener('click', function () {
        wsSend('paris.stop_timer()\r\n');
        wsSend('paris.ambient()\r\n');
    });

    document.querySelector('#btn-focus').addEventListener('click', function () {
        wsSend('paris.stop_timer()\r\n');
        wsSend('paris.set_sides((0,32,127,0),(0,32,127,0),(0,0,0,127),(0,32,127,0),False)\r\n');
    });

    document.querySelector('#btn-vertical').addEventListener('click', function () {
        var fn = 'set_sides(' + getColor('north') + ',(0,0,0,0),' + getColor('south') + ',(0,0,0,0),True)';
        wsSend('paris.stop_timer()\r\n');
        wsSend('paris.' + fn + '\r\n');
    });

    document.querySelector('#btn-horizontal').addEventListener('click', function () {
        var fn = 'set_sides((0,0,0,0),' + getColor('east') + ',(0,0,0,0),' + getColor('west') + ',True)';
        wsSend('paris.stop_timer()\r\n');
        wsSend('paris.' + fn + '\r\n');
    });

    document.querySelector('#btn-circle').addEventListener('click', function () {
        wsSend('paris.stop_timer()\r\n');
        parseAndExec('set_sides({north},{east},{south},{west},False)');
    });

    document.querySelector('#btn-square').addEventListener('click', function () {
        wsSend('paris.stop_timer()\r\n');
        parseAndExec('set_sides({north},{east},{south},{west},True)');
    });

    document.querySelector('#btn-sleep').addEventListener('click', function () {
        wsSend('paris.stop_timer()\r\n');
        wsSend('paris.off()\r\n');
    });

    document.querySelector('#btn-larson').addEventListener('click', function () {
        parseAndExec('run_larson_scanner(\'south\',(0,255,0,0),(0,0,0,0))');
    });

    document.querySelector('#btn-spin').addEventListener('click', function () {
        parseAndExec('run_spin({north},{frequency})');
    });

    document.querySelector('#dimmer').addEventListener('change', function (e) {
        wsSend('paris.apply_dimmer(' + e.target.value + ')\r\n');
    });

    resizeVerticalSliders();

    ['rgbnorth', 'rgbeast', 'rgbsouth', 'rgbwest'].forEach(function (id) {
        var picker = document.getElementById(id);
        updateColor(picker);
        picker.addEventListener('change', function () { updateColor(this); });
    });
});

window.addEventListener('resize', resizeVerticalSliders);
