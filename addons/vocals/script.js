let poller = new SnifferPoller({
	
	// Polling interval in ms
	interval: 30,
	
	// Latency compensation in second
	// If the lyrics are displayed with a delay, this value must be increased
	// It depends on the power of your PC and the usage of your network
	latencyCompensation: 0.3,

	// Time in second for display vocal before lyric start
	preVocalDisplayTime: 2,
	// Number of line displayed, This value can be exceeded when it sings fast
	numberOfLinesDisplayed: 2,
	
	// Max note kepping, Use for compatibility with bad length of vocal
	maxNoteKepping: 2.5,

	// Line slide duration in seconds, 0 disables it
	lineAnimationDuration: 0.5,

	// Per-line height, scale with font-size
	lineHeight: '1.2em',

	_lineStructure: null,
	_vocalsRef: null,
	_displayedLines: {},
	_containerInitialized: false,

	onData: function (data) {
		if (data.currentState != STATE_SONG_PLAYING) {
			this._clearAllLines();
			return;
		}

		let currentTime = data.memoryReadout.songTimer + this.latencyCompensation;
		let vocals = data.songDetails ? data.songDetails.vocals : null;

		if (currentTime <= 0 || vocals == null || vocals.length <= 0) {
			this._clearAllLines();
			return;
		}

		this._initContainer();

		if (this._vocalsRef !== vocals) {
			this._lineStructure = this._buildLineStructure(vocals);
			this._vocalsRef = vocals;
		}

		if (this._lineStructure.length === 0) {
			this._clearAllLines();
			return;
		}

		// The active line is the last one that started, so it stays up between lines like in game
		let activeLineIdx = -1;
		for (let i = 0; i < this._lineStructure.length; i++) {
			if (this._lineStructure[i].startTime <= currentTime) {
				activeLineIdx = i;
			} else {
				break;
			}
		}

		// Show the first line preVocalDisplayTime early
		let isAnticipating = false;
		if (activeLineIdx === -1) {
			if (this._lineStructure[0].startTime - currentTime <= this.preVocalDisplayTime) {
				activeLineIdx = 0;
				isAnticipating = true;
			} else {
				this._clearAllLines();
				return;
			}
		}

		// Preview line(s) only after at least one line has started.
		let targetSlots = {};
		targetSlots[activeLineIdx] = 'active';
		if (!isAnticipating) {
			for (let offset = 1; offset < this.numberOfLinesDisplayed; offset++) {
				let previewIdx = activeLineIdx + offset;
				if (previewIdx < this._lineStructure.length) {
					targetSlots[previewIdx] = (offset === 1) ? 'preview' : ('preview' + offset);
				}
			}
		}

		for (let idxStr in targetSlots) {
			let lineIdx = parseInt(idxStr);
			let targetSlot = targetSlots[lineIdx];
			if (this._displayedLines[lineIdx]) {
				let state = this._displayedLines[lineIdx];
				if (state.removalTimer) {
					clearTimeout(state.removalTimer);
					state.removalTimer = null;
				}
				if (state.slot !== targetSlot) {
					this._setSlot(state.element, targetSlot);
					state.slot = targetSlot;
				}
			} else {
				this._createLine(lineIdx, vocals, targetSlot);
			}
		}

		for (let idxStr in this._displayedLines) {
			let lineIdx = parseInt(idxStr);
			let state = this._displayedLines[lineIdx];
			if (!(lineIdx in targetSlots) && state.slot !== 'outgoing') {
				this._setSlot(state.element, 'outgoing');
				state.slot = 'outgoing';
				this._scheduleRemoval(lineIdx);
			}
		}

		for (let idxStr in targetSlots) {
			let lineIdx = parseInt(idxStr);
			this._updateSyllableClasses(
				this._displayedLines[lineIdx].element,
				this._lineStructure[lineIdx],
				vocals,
				currentTime
			);
		}
	},

	_initContainer: function () {
		if (this._containerInitialized) return;
		$('.vocal').css({
			position: 'relative',
			overflow: 'hidden',
			height: 'calc(' + this.numberOfLinesDisplayed + ' * ' + this.lineHeight + ')'
		});
		this._containerInitialized = true;
	},

	_buildLineStructure: function (vocals) {
		let lines = [];
		let current = { syllableIndices: [], startTime: 0, endTime: 0 };
		let starting = true;
		for (let i = 0; i < vocals.length; i++) {
			let v = vocals[i];
			if (starting) {
				current.startTime = v.Time;
				starting = false;
			}
			let len = Math.min(v.Length, this.maxNoteKepping);
			current.endTime = Math.max(current.endTime, v.Time + len);
			current.syllableIndices.push(i);
			if (v.Lyric.endsWith('+')) {
				lines.push(current);
				current = { syllableIndices: [], startTime: 0, endTime: 0 };
				starting = true;
			}
		}
		if (current.syllableIndices.length > 0) lines.push(current);
		return lines;
	},

	_createLine: function (lineIdx, vocals, targetSlot) {
		let lineData = this._lineStructure[lineIdx];
		let div = $('<div class="lyric-line"></div>');
		div.css({
			position: 'absolute',
			left: 0,
			right: 0,
			top: 0,
			height: this.lineHeight,
			'line-height': this.lineHeight,
			'white-space': 'nowrap',
			transition: 'transform ' + this.lineAnimationDuration + 's ease',
			transform: 'translateY(' + (this.numberOfLinesDisplayed * 100) + '%)'
		});

		// span.lyric is styled by the themes
		let lyricSpan = $('<span class="lyric"></span>');

		for (let k = 0; k < lineData.syllableIndices.length; k++) {
			let sylIdx = lineData.syllableIndices[k];
			let v = vocals[sylIdx];
			let lyric = v.Lyric;
			let isNoSpace = lyric.endsWith('-');
			let isLineBreak = lyric.endsWith('+');
			if (isNoSpace || isLineBreak) {
				lyric = lyric.substr(0, lyric.length - 1);
			}
			let span = $('<span class="syllable syllable-future"></span>')
				.text(lyric)
				.attr('data-syl-idx', sylIdx);
			lyricSpan.append(span);
			if (!isNoSpace && !isLineBreak) {
				lyricSpan.append(' ');
			}
		}

		div.append(lyricSpan);
		$('.vocal').append(div);

		this._displayedLines[lineIdx] = {
			element: div,
			slot: 'incoming',
			removalTimer: null
		};

		// Reflow first, or the transition doesn't run
		void div[0].offsetHeight;

		let self = this;
		requestAnimationFrame(function () {
			let state = self._displayedLines[lineIdx];
			if (state && state.slot === 'incoming') {
				self._setSlot(state.element, targetSlot);
				state.slot = targetSlot;
			}
		});
	},

	// Slot to translateY %: incoming N*100 (below), preview 100, active 0,
	// outgoing -100 (above), preview2/3/... 200/300/...
	_setSlot: function (element, slot) {
		let yPercent;
		if (slot === 'incoming') {
			yPercent = this.numberOfLinesDisplayed * 100;
		} else if (slot === 'active') {
			yPercent = 0;
		} else if (slot === 'outgoing') {
			yPercent = -100;
		} else if (slot === 'preview') {
			yPercent = 100;
		} else if (slot.indexOf('preview') === 0) {
			yPercent = parseInt(slot.substr('preview'.length)) * 100;
		} else {
			yPercent = 0;
		}
		element.css('transform', 'translateY(' + yPercent + '%)');
	},

	_scheduleRemoval: function (lineIdx) {
		let self = this;
		let state = this._displayedLines[lineIdx];
		state.removalTimer = setTimeout(function () {
			let s = self._displayedLines[lineIdx];
			if (s && s.slot === 'outgoing') {
				s.element.remove();
				delete self._displayedLines[lineIdx];
			}
		}, (this.lineAnimationDuration * 1000) + 100);
	},

	_updateSyllableClasses: function (lineElement, lineData, vocals, currentTime) {
		let maxNote = this.maxNoteKepping;
		lineElement.find('.syllable').each(function () {
			let sylIdx = parseInt($(this).attr('data-syl-idx'));
			let v = vocals[sylIdx];
			let noteKeeping = Math.min(v.Length, maxNote);
			let timeDiff = currentTime - v.Time;
			let cls;
			if (timeDiff < 0) {
				cls = 'syllable-future';
			} else if (timeDiff > noteKeeping) {
				cls = 'syllable-past';
			} else {
				cls = 'syllable-current';
			}
			let next = 'syllable ' + cls;
			if ($(this).attr('class') !== next) {
				$(this).attr('class', next);
			}
		});
	},

	_clearAllLines: function () {
		for (let idxStr in this._displayedLines) {
			let state = this._displayedLines[idxStr];
			if (state.removalTimer) {
				clearTimeout(state.removalTimer);
			}
			state.element.remove();
		}
		this._displayedLines = {};
	},

	onSongChanged: function (f) {
		this._clearAllLines();
		this._lineStructure = null;
		this._vocalsRef = null;
	},

	onSongStarted: function (f) {
		this._clearAllLines();
	},

	onSongEnded: function (f) {
		this._clearAllLines();
	}
});