var poller = new SnifferPoller({
	interval: 500,

	onData: function(data) {
		app.snifferData = data;
	},
	onSongStarted: function(data) {
		app.mode = 0;
		app.visible = true;
		clearTimeout(hideTimeout);
	},
	onSongEnded: function(data) {
		app.prevData = app.snifferData;
		app.mode = 1;

		generateFeedback();
	}
});

var tracker = new PlaythroughTracker(poller);

var app = new Vue({
	el: "#app",
	data: {
		visible: false,
		mode: 0,
		prevData: {},
		snifferData: {},
		feedback: [],
		feedbackIdx: 0
	},
	methods: {
		cycleFeedback: function() {
			if(this.mode == 1) {
				setTimeout(() => this.cycleFeedback(), 5000);
				this.feedbackIdx = (this.feedbackIdx+1) % this.feedback.length;
			}
		},
		hasPreviousBest: function() {
			return tracker.hasPreviousBest();
		},
		trackerScore: function() {
			return tracker.getFinal();
		}
	},
	computed: {
		song: function() {
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
			if(this.song == null) {return null;}
			if(this.song.arrangements == null) {return null;}

			for (var i = this.song.arrangements.length - 1; i >= 0; i--) {
				var arrangement = this.song.arrangements[i];

				if(arrangement.arrangementID == this.readout.arrangementID) {
					return arrangement;
				}
			}

			return null;
		},
		sections: function() {
			var arrangement = this.arrangement;

			if(arrangement == null) {return null;}

			var sections = arrangement.sections;

			var songLength = this.song.songLength;

			for (var i = 0; i < sections.length; i++) {
				var section = sections[i];

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

			for (var i = this.prevSong.arrangements.length - 1; i >= 0; i--) {
				var arrangement = this.prevSong.arrangements[i];

				if(arrangement.arrangementID == this.prevReadout.arrangementID) {
					return arrangement;
				}
			}

			return null;
		},
		prevSections: function() {
			var arrangement = this.prevArrangement;

			if(arrangement == null) {return null;}

			var sections = arrangement.sections;

			var songLength = this.prevSong.songLength;

			for (var i = 0; i < sections.length; i++) {
				var section = sections[i];

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
	var minutes = Math.floor(time/60);
	var seconds = time % 60;

	if(time < 0) {
		return "";
	}

	return [minutes,seconds].map(X => ('0' + Math.floor(X)).slice(-2)).join(':')
}

var hideTimeout = null;
function generateFeedback() {
	app.feedback = [];

	var arrangement = poller.getCurrentArrangement();
	var sections = arrangement.sections;
	var feedback = []

	var greens = 0;

	for (var i = sections.length - 1; i >= 0; i--) {
		var section = sections[i];
		var rel = tracker.getRelative(section.endTime);

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
