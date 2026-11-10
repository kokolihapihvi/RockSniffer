
const poller = new SnifferPoller({
	interval: 500,

	onData: function(data) {
		app.snifferData = data;
	},
	onSongStarted: function(data) {
		clearTimeout(hideTimeout);
	},
	onSongEnded: function(data) {
		app.prevData = app.snifferData;
		// Finalize the last section, then snapshot tracker outputs, before
		// generateFeedback and the tracker's own callbacks (which fire after this
		// handler and would otherwise leave the last section unfinalized, then reset
		// the data). finalize() is idempotent; the tracker's later call no-ops.
		if (tracker.currentAttempt) {
			tracker.currentAttempt.finalize(poller.getCurrentReadout());
		}
		app.snapshotHasPreviousBest = tracker.hasPreviousBest();
		app.snapshotFinal = tracker.getFinal();
		app.mode = 1;
		poller.resultsHold.markShown();

		generateFeedback();
	},
});

const tracker = new PlaythroughTracker(poller);

const app = new Vue({
	el: "#app",
	data: {
		visible: false,
		mode: 0,
		prevData: {},
		snifferData: {},
		feedback: [],
		feedbackIdx: 0,
		// Snapshots of tracker outputs at onSongEnded - read during mode 1 so the
		// comparison survives the tracker's NSP reset. See current_song_v3/script.js.
		snapshotHasPreviousBest: null,
		snapshotFinal: null
	},
	methods: {
		cycleFeedback: function() {
			if(this.mode == 1) {
				setTimeout(() => this.cycleFeedback(), 5000);
				this.feedbackIdx = (this.feedbackIdx+1) % this.feedback.length;
			}
		},
		hasPreviousBest: function() {
			if (this.mode === 1 && this.snapshotHasPreviousBest !== null) {
				return this.snapshotHasPreviousBest;
			}
			return tracker.hasPreviousBest();
		},
		trackerScore: function() {
			if (this.mode === 1 && this.snapshotFinal !== null) {
				return this.snapshotFinal;
			}
			return tracker.getFinal();
		}
	},
	computed: {
		// In mode 1, read from prevData so song info matches the stats shown.
		song: function() {
			if (this.mode === 1 && this.prevData && this.prevData.songDetails) {
				return this.prevData.songDetails;
			}
			if(!this.snifferData) {
				return null;
			}

			return this.snifferData.songDetails;
		},
		readout: function() {
			if(!this.snifferData) {
				return null;
			}

			return this.snifferData.memoryReadout;
		},
		notes: function() {
			if(!this.snifferData) {
				return null;
			}

			return this.readout.noteData;
		},
		songLength: function() {
			return formatTimer(this.song.songLength);
		},
		songTimer: function() {
			return formatTimer(this.readout.songTimer);
		},
		songProgress: function() {
			return (this.readout.songTimer / this.song.songLength) * 100;
		},
		arrangement: function() {
			//Shared resolver (sniffer-poller.js): arrangementID direct match, then
			//currentPath filter. Passing this.song keeps mode-1 resolution bound to
			//the displayed (prevData) song even after the poller has advanced to the
			//next Nonstop song.
			if(this.song == null) {return null;}
			return poller.resolveArrangement(this.song, this.readout);
		},
		sections: function() {
			arrangement = this.arrangement;

			if(arrangement == null) {return null;}

			let sections = arrangement.sections;

			let songLength = this.song.songLength;

			for (let i = 0; i < sections.length; i++) {
				let section = sections[i];

				if(this.readout.songTimer < section.endTime) {
					break;
				}

				section.length = section.endTime - section.startTime;

				section.startPercent = (section.startTime / songLength) * 100;
				
				//Always make the first section start from 0%
				if(i == 0) {
					section.length = section.endTime;
					section.startPercent = 0;
				}

				section.endPercent = (section.endTime / songLength) * 100;

				section.lengthPercent = (section.length / songLength) * 100;

				section.style = {
					left: section.startPercent+'%',
					width: section.lengthPercent+'%',
					backgroundColor: 'transparent'
				}

				if(tracker.hasPreviousBest()) {
					section.style.backgroundColor = (tracker.isBetterRelative(section.endTime) ? "green" : "red");
				}

				sections[i] = section;
			}

			return sections;
		},
		/* PREV */
		prevSong: function() {
			return this.prevData.songDetails;
		},
		prevReadout: function() {
			if(!this.prevData) {
				return null;
			}

			return this.prevData.memoryReadout;
		},
		prevNotes: function() {
			if(!this.snifferData) {
				return null;
			}

			return this.prevReadout.noteData;
		},
		prevArrangement: function() {
			if(this.prevSong == null) {return null;}
			if(this.prevSong.arrangements == null) {return null;}

			for (let i = this.prevSong.arrangements.length - 1; i >= 0; i--) {
				arrangement = this.prevSong.arrangements[i];

				if(arrangement.arrangementID == this.prevReadout.arrangementID) {
					return arrangement;
				}
			}

			return null;
		},
		prevSections: function() {
			arrangement = this.prevArrangement;

			if(arrangement == null) {return null;}

			sections = arrangement.sections;

			songLength = this.prevSong.songLength;

			for (let i = 0; i < sections.length; i++) {
				section = sections[i];

				section.length = section.endTime - section.startTime;

				section.startPercent = (section.startTime / songLength) * 100;

				//Always make the first section start from 0%
				if(i == 0) {
					section.length = section.endTime;
					section.startPercent = 0;
				}

				section.endPercent = (section.endTime / songLength) * 100;

				section.lengthPercent = (section.length / songLength) * 100;

				section.style = {
					left: section.startPercent+'%',
					width: section.lengthPercent+'%',
					backgroundColor: 'white'
				}

				if(tracker.hasPreviousBest()) {
					section.style.backgroundColor = (tracker.isBetterRelative(section.endTime) ? "green" : "red");
				}

				sections[i] = section;
			}

			return sections;
		}
	}
});

function formatTimer(time) {
	if (time < 0) {
		return "";
	}

	const minutes = Math.floor(time / 60);
	const seconds = time % 60;

	return [minutes, seconds].map(X => ('0' + Math.floor(X)).slice(-2)).join(':')
}

let hideTimeout = null;
function generateFeedback() {
	app.feedback = [];

	arrangement = poller.getCurrentArrangement();
	//Defensive: getCurrentArrangement can return null when memoryReadout.arrangementID is junk
	//(e.g. uninitialized or stale memory pointers in RSMemoryReader). Without this guard,
	//`arrangement.sections` throws TypeError, propagating out of _doOnSongEnded -> gotData
	//and aborting the poll BEFORE _doOnData runs - which freezes app.snifferData.
	//Lowercase "you tried!" matches V2's existing fallback at line ~264 (vs V3/V3.1/Arcade's
	//uppercase "YOU TRIED!" - within-file style consistency wins over cross-file consistency).
	if(arrangement == null) {
		app.feedback = ["you tried!"];
		app.cycleFeedback();
		hideTimeout = setTimeout(() => {if(app.mode == 1) {app.mode = 0; app.visible = false;}}, 60000);
		return;
	}
	sections = arrangement.sections;
	let feedback = []

	let greens = 0;

	for (let i = sections.length - 1; i >= 0; i--) {
		section = sections[i];
		const rel = tracker.getRelative(section.endTime);

		if(rel == null) {
			continue;
		}

		if(rel.Accuracy >= 0) {
			greens++;
		}

		if(rel.Accuracy >= 1) {
			feedback.push("got "+rel.Accuracy.toFixed(2)+"% better accuracy in "+section.name);
		}
		if(rel.TotalNotesHit > 2) {
			feedback.push("hit "+rel.TotalNotesHit+" more notes in "+section.name);
		}
	}

	if(greens > 0) {
		feedback.push(greens+" green sections");
	}

	feedback.sort(() => Math.random() - 0.5);

	if(poller.getCurrentAccuracy() == 100) {
		feedback.push("hit all the notes");
	}

	if(feedback.length == 0) {
		feedback.push("you tried!");
	}

	app.feedback = feedback;

	app.cycleFeedback();

	hideTimeout = setTimeout(() => {if(app.mode == 1) {app.mode = 0; app.visible = false;}}, 60000);
}

// Shared mode-1 results min-hold (implementation in sniffer-poller.js).
poller.enableResultsHold(app);
