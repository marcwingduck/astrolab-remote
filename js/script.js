var ws = null;
var pending = [];    // sent while not connected, goes out once the board is
var received = '';   // the board's output not yet split into lines
var dimmerTouched = 0;  // when the brightness slider was last moved, so the board's answer doesn't undo it
var selected = ['north', 'east', 'south', 'west'];  // the sides the hue and white sliders change
var cardinals = ['north', 'east', 'south', 'west'];

// ----------------------------------------------------------------------------
// connection

function webreplConnect(url, password) {
    var opened = false;
    ws = new WebSocket(url);
    ws.onopen = function () {
        opened = true;
        ws.send(password + '\r\n');
        ws.send('\x03');
        // what was clicked before the connection first, so the dimmer read back already includes it
        pending.forEach(function (msg) { ws.send(msg); });
        pending = [];
        ws.send("print('DIMMER', paris.dimmer)\r\n");
        updateStatus();
    };
    ws.onmessage = function (e) { if (typeof e.data === 'string') receive(e.data); };
    ws.onclose = function () {
        if (!opened && !this.leaving) showError('Board not reachable at ' + url);
        pending = [];      // not sent later, all at once: a new click reconnects
        if (ws === this) ws = null;  // an older socket closing late leaves the new one alone
        updateStatus();
    };
    ws.onerror = function () { updateStatus(); };
    updateStatus();
}

function connect() {
    if (ws) ws.close();
    webreplConnect(document.getElementById('boardURL').value, document.getElementById('password').value);
}

// sends right away, or connects first and sends then
function wsSend(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log(msg);
        ws.send(msg);
    } else {
        pending.push(msg);
        if (!ws) connect();
    }
}

// the board's output, line by line: errors show under the title, the dimmer goes to its slider
function receive(text) {
    received += text;
    var lines = received.split(/\r?\n/);
    received = lines.pop();
    lines.forEach(function (line) {
        var dimmer = line.match(/^DIMMER ([\d.]+)\s*$/);
        if (dimmer) {
            if (Date.now() - dimmerTouched > 3000) document.getElementById('dimmer').value = dimmer[1];
        } else if (/^\w*(Error|Exception)\b/.test(line)) {
            showError(line);
        }
    });
}

function showError(text) {
    var el = document.getElementById('error');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(showError.timer);
    showError.timer = setTimeout(function () { el.hidden = true; }, 10000);
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

// ----------------------------------------------------------------------------
// colors: a hue per side (below 0: no color) plus its white, as the strip's G, R, B, W

function hueToRgb(h) {
    function f(n) {
        var k = (n + h / 60) % 6;
        return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1))));
    }
    return [f(5), f(3), f(1)];
}

function getColor(cardinal) {
    var hue = parseInt(document.getElementById('h' + cardinal).value);
    var w = parseInt(document.getElementById('w' + cardinal).value);
    var rgb = hue < 0 ? [0, 0, 0] : hueToRgb(hue);
    return '(' + [rgb[1], rgb[0], rgb[2], w].join() + ')';
}

function updateColor(cardinal) {
    var hue = parseInt(document.getElementById('h' + cardinal).value);
    var control = document.querySelector('[data-cardinal="' + cardinal + '"]');
    var direction = { north: 'to top', east: 'to right', south: 'to bottom', west: 'to left' }[cardinal];
    var color = hue < 0 ? 'rgba(0,0,0,0)' : 'hsl(' + hue + ',100%,50%)';
    control.querySelector('.side-control-color').style.backgroundImage =
        'linear-gradient(' + direction + ',' + color + ', rgba(0,0,0,0))';
}

function setWhite(cardinal, value) {
    var control = document.querySelector('[data-cardinal="' + cardinal + '"]');
    document.getElementById('w' + cardinal).value = value;
    control.querySelector('.side-control-white').style[cardinal === 'north' || cardinal === 'south' ? 'height' : 'width'] =
        (value / 255) * 100 + '%';
}

// tapping a side toggles it for the sliders (none is fine), tapping the map selects all four
function select(sides) {
    selected = sides;
    cardinals.forEach(function (c) {
        document.querySelector('[data-cardinal="' + c + '"]').classList.toggle('selected', sides.indexOf(c) >= 0);
    });
    if (!sides.length) return;  // the sliders keep their position and change nothing
    document.getElementById('hue').value = document.getElementById('h' + sides[0]).value;
    document.getElementById('white').value = document.getElementById('w' + sides[0]).value;
}

function initSideControls() {
    document.querySelectorAll('.side-control').forEach(function (control) {
        var cardinal = control.dataset.cardinal;
        control.addEventListener('click', function () {
            var sides = cardinals.filter(function (c) { return (c === cardinal) !== (selected.indexOf(c) >= 0); });
            select(sides);
        });
        setWhite(cardinal, parseInt(document.getElementById('w' + cardinal).value));
        updateColor(cardinal);
    });
}

// ----------------------------------------------------------------------------
// commands

// fills in the current colors, frequency and led index
function fill(text) {
    return text
        .replace('{north}', getColor('north'))
        .replace('{east}', getColor('east'))
        .replace('{south}', getColor('south'))
        .replace('{west}', getColor('west'))
        .replace('{frequency}', parseFloat(document.getElementById('frequency').value))
        .replace('{index}', parseFloat(document.getElementById('index').value));
}

// switches the map to a mode by name, with its arguments; the board stops whatever runs
function show(name) {
    var args = ["'" + name + "'"].concat(Array.prototype.slice.call(arguments, 1));
    wsSend('paris.show(' + args.join(',') + ')\r\n');
}

// runs a test function, e.g. test_led(3); the board loads its tests module only for this
function parseAndExec(text) {
    wsSend('paris.stop_timer()\r\n');
    wsSend('import tests\r\n');
    wsSend('tests.' + fill(text) + '\r\n');
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
        show('solunar');
    });

    document.getElementById('btn-clock').addEventListener('click', function () {
        var continuous = document.getElementById('clk_continuous').checked ? 'True' : 'False';
        show('clock', continuous);
    });

    document.getElementById('btn-clock2').addEventListener('click', function () {
        var start_at_minute = document.getElementById('clk_start_at_minute').checked ? 'True' : 'False';
        var two_colors = document.getElementById('clk_two_colors').checked ? 'True' : 'False';
        var ambient = document.getElementById('clk_ambient').checked ? 'True' : 'False';
        show('neo', start_at_minute, two_colors, ambient);
    });

    document.getElementById('btn-focus').addEventListener('click', function () {
        show('sides', '(0,32,127,0)', '(0,32,127,0)', '(0,0,0,127)', '(0,32,127,0)', 'False');
    });

    // top to bottom, from the north color to the south color
    document.getElementById('btn-vertical').addEventListener('click', function () {
        show('vertical_interp', getColor('north'), getColor('south'));
    });

    // top half in the north color, bottom half in the south color
    document.getElementById('btn-halves').addEventListener('click', function () {
        show('vertical', getColor('north'), getColor('south'));
    });

    document.getElementById('btn-circle').addEventListener('click', function () {
        show('sides', getColor('north'), getColor('east'), getColor('south'), getColor('west'), 'False');
    });

    document.getElementById('btn-square').addEventListener('click', function () {
        show('sides', getColor('north'), getColor('east'), getColor('south'), getColor('west'), 'True');
    });

    // the whole frame in the selected side's color, brightest where the edge is nearest the center
    document.getElementById('btn-radial').addEventListener('click', function () {
        show('radial', getColor(selected[0] || 'north'));  // nothing selected: north, as spin
    });

    document.getElementById('btn-sleep').addEventListener('click', function () {
        show('off');
    });

    document.getElementById('btn-larson').addEventListener('click', function () {
        show('larson', "'south'", '(0,255,0,0)', '(0,0,0,0)');
    });

    document.getElementById('btn-spin').addEventListener('click', function () {
        show('spin', getColor('north'), parseFloat(document.getElementById('frequency').value));
    });

    ['pointerdown', 'input'].forEach(function (ev) {
        document.getElementById('dimmer').addEventListener(ev, function () { dimmerTouched = Date.now(); });
    });

    document.getElementById('dimmer').addEventListener('change', function (e) {
        wsSend('paris.apply_dimmer(' + e.target.value + ')\r\n');
    });

    initSideControls();

    // the map selects all four sides, or none if all four already are
    document.getElementById('btn-all-color').addEventListener('click', function () {
        select(selected.length === cardinals.length ? [] : cardinals.slice());
    });

    document.getElementById('hue').addEventListener('input', function () {
        var hue = this.value;
        selected.forEach(function (c) {
            document.getElementById('h' + c).value = hue;
            updateColor(c);
        });
    });

    document.getElementById('white').addEventListener('input', function () {
        var white = parseInt(this.value);
        selected.forEach(function (c) { setWhite(c, white); });
    });

    select(cardinals.slice());
    connect();

    // A page in the background (another tab, the phone locked) lets go of the board: the webrepl
    // takes only one connection, so an open tab no longer blocks deploys or debugging. Coming back
    // reconnects.
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            if (ws) {
                ws.leaving = true;  // closed on purpose: no "not reachable"
                ws.close();
                ws = null;
            }
        } else if (!ws) {
            connect();
        }
    });
});
