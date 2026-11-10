const widthUI = document.getElementsByClassName("mainContainer")[0].offsetWidth;
const gradeCode = {
	NaN : 'white',
	'error' : 'white',
	'No Data' : 'grey',
	'Rest' : 'black',
	'Fail' : '#fc0000',
	'Pass' : '#480055',
	'Good' : '#fcd800',
	'Perfect' : '#00fc00'
}
function accuracyGradient(accuracy){
	if (accuracy == "Rest"){return "grey"}
	if (accuracy < 50){return "rgb(255, 0, 0)"}
	const red = (Math.floor(Math.min(((100 - accuracy)/25),1) * 8)/ 8) * 255;
	const green = (Math.floor(Math.min(((accuracy - 50)/25),1) * 8) / 8) * 255;
	return "rgb("+red+","+green+", 0)";
};

const poller = new SnifferPoller({
	interval: 100,

	onData: function(data) {
		app.snifferData = data;
	},
	
	onSongEnded: function(data) {
		app.prevData = app.snifferData;
		// Finalize and snapshot before the tracker's own onSongEnded resets it
		if (tracker.currentAttempt) {
			tracker.currentAttempt.finalize(poller.getCurrentReadout());
		}
		app.snapshotHasPreviousBest = tracker.hasPreviousBest();
		app.snapshotFinal = tracker.getFinal();
		app.mode = 1;
		poller.resultsHold.markShown();
		generateFeedback();
	}
});

const tracker = new PlaythroughTracker(poller);

const app = new Vue({
	el: "#app",
	data: {
		visible: true,
		mode: 0,
		prevData: {},
		snifferData: {},
		feedback: [],
		feedbackIdx: 0,
		// Tracker results at song end, shown in mode 1 after the tracker resets
		snapshotHasPreviousBest: null,
		snapshotFinal: null,
        songInfoTransform: "translateX(0px)"
	},
    mounted: function() {
        setInterval(this.doScrollSong, 8000);
    },
	methods: {
        doScrollSong: function() {
			let width = 0;
			if(this.song != null){
				width = (document.getElementsByClassName("songName")[0].offsetWidth + document.getElementsByClassName("songDash")[0].offsetWidth + document.getElementsByClassName("artistName")[0].offsetWidth)+10;
			}
            if(this.songInfoTransform == "translateX(0px)" && width > widthUI) {
                this.songInfoTransform = "translateX(-"+(width-widthUI)+"px)";
            } else {
                this.songInfoTransform = "translateX(0px)";
            }
        },
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
		// In mode 1, show the song that just ended
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
			if (this.readout.songTimer == 0){return 0;}
			return (this.readout.songTimer / this.song.songLength) * 100;
		},
		phraseStartTime: function() {
			if (this.readout.songTimer == 0){return 0;}
			const currentPhrase = poller.getCurrentPhrase();
			if(currentPhrase == null){return 0;}
			if(currentPhrase.index == 0){return 0;}
			return (currentPhrase.startTime / this.song.songLength) * 100;
		},
		phraseHeight: function() {
			if (this.readout.songTimer == 0){return 0;}
			let phraseHeight = 1;
			const maxDif = poller.getMaxDif();
			const phrase = poller.getCurrentPhrase();
			if(maxDif != 0){
				phraseHeight = phrase.maxDifficulty/maxDif;
			}
			return phraseHeight*100;
		},			
		hitDisplay: function(){
			$("div.hitDisplay").removeAttr('style');
			let accHit = '0000';
			let notesHit = '0000';
			let totalNotes = '0000';
			if (this.readout.songTimer == 0){
				return accHit.substr(accHit.length-4)+'% '+notesHit.substr(notesHit.length-4)+'/'+totalNotes.substr(totalNotes.length-4);
			}
			const songProg = this.songProgress;
			const acc = this.notes.Accuracy;
			const totN = this.notes.TotalNotes;
			if(acc == 100){
				accHit = accHit + '0100'
			}else{
				accHit = accHit + String(acc.toFixed(1));
			}
			notesHit = notesHit + String(this.notes.TotalNotesHit);
			totalNotes = totalNotes + String(totN);	
			if(totN > 0){
				if (songProg >= 80 & acc >= 99.8){
					$("div.hitDisplay").css({
						"background": "repeating-linear-gradient(180deg, #c1beba, #d9d8d4, #e5e4e2, #fdfdfd, #e5e4e2, #d9d8d4, #c1beba, #d9d8d4, #e5e4e2, #fdfdfd, #e5e4e2, #d9d8d4, #c1beba, #d9d8d4, #e5e4e2, #fdfdfd, #e5e4e2, #d9d8d4)",
						"background-size": "100% 24px",
						"-webkit-text-fill-color": "transparent",
						"-webkit-background-clip": "text",
						  "animation": "slide 2s linear infinite forwards"
					})	
				} else if (songProg >= 70 & acc >= 99){
					$("div.hitDisplay").css({
						"background": "repeating-linear-gradient(180deg, #fcb400, #fcd855, #fcfcaa, #fcfcfc, #fcfcaa, #fcd855, #fcb400, #fcd855, #fcfcaa, #fcfcfc, #fcfcaa, #fcd855, #fcb400, #fcd855, #fcfcaa, #fcfcfc, #fcfcaa, #fcd855)",
						"background-size": "100% 24px",
						"-webkit-text-fill-color": "transparent",
						"-webkit-background-clip": "text",
						  "animation": "slide 2s linear infinite forwards"
					})					
				} else if (songProg >= 60 & acc >= 98){
					$("div.hitDisplay").css({				
						"background": "repeating-linear-gradient(180deg, #9a9a9a, #b3b3b3, #c0c0c0, #dadada, #c0c0c0, #b3b3b3, #9a9a9a, #b3b3b3, #c0c0c0, #dadada, #c0c0c0, #b3b3b3, #9a9a9a, #b3b3b3, #c0c0c0, #dadada, #c0c0c0, #b3b3b3)",
						"background-size": "100% 24px",
						"-webkit-text-fill-color": "transparent",
						"-webkit-background-clip": "text",
						  "animation": "slide 2s linear infinite forwards"
					})					
				} else if (songProg >= 50 & acc >= 97){
					$("div.hitDisplay").css({
						"background": "repeating-linear-gradient(180deg, #d89000, #d8b400, #d8d855, #d8fcaa, #d8d855, #d8b400, #d89000, #d8b400, #d8d855, #d8fcaa, #d8d855, #d8b400, #d89000, #d8b400, #d8d855, #d8fcaa, #d8d855, #d8b400)",
						"background-size": "100% 24px",
						"-webkit-text-fill-color": "transparent",
						"-webkit-background-clip": "text",
						  "animation": "slide 2s linear infinite forwards"
					})					
				} else {;
					$("div.hitDisplay").css({
						"color": accuracyGradient(acc),
					})
				}
			}
			return accHit.substr(accHit.length-4)+'% '+notesHit.substr(notesHit.length-4)+'/'+totalNotes.substr(totalNotes.length-4);
		},			
		strDisplay: function(){
			$("div.strDisplay").removeAttr('style');
			let curStr = '0000';
			let maxStr = '0000';
			if (this.readout.songTimer == 0){
				return curStr.substr(curStr.length-4)+'/'+maxStr.substr(maxStr.length-4)
			};	
			const curS = this.notes.CurrentHitStreak-this.notes.CurrentMissStreak;
			const maxS = this.notes.HighestHitStreak;
			const totN = this.notes.TotalNotes;
			curStr = curStr + String(Math.abs(curS));
			maxStr = maxStr + String(maxS);
			let neg = '';
			if (curS < 0){
				neg = '-'
			}
			if(totN > 0){
				if(curS < 0){			
					$("div.strDisplay").css({
						"color": '#fc0000',
					})					
				} else if (curS >= 500){			
					$("div.strDisplay").css({
						"background": "repeating-linear-gradient(180deg, #c1beba, #d9d8d4, #e5e4e2, #fdfdfd, #e5e4e2, #d9d8d4, #c1beba, #d9d8d4, #e5e4e2, #fdfdfd, #e5e4e2, #d9d8d4, #c1beba, #d9d8d4, #e5e4e2, #fdfdfd, #e5e4e2, #d9d8d4)",
						"background-size": "100% 24px",
						"-webkit-text-fill-color": "transparent",
						"-webkit-background-clip": "text",
						  "animation": "slide 2s linear infinite forwards"
					})
				} else if (curS >= 400){			
					$("div.strDisplay").css({
						"background": "repeating-linear-gradient(180deg, #fcb400, #fcd855, #fcfcaa, #fcfcfc, #fcfcaa, #fcd855, #fcb400, #fcd855, #fcfcaa, #fcfcfc, #fcfcaa, #fcd855, #fcb400, #fcd855, #fcfcaa, #fcfcfc, #fcfcaa, #fcd855)",
						"background-size": "100% 24px",
						"-webkit-text-fill-color": "transparent",
						"-webkit-background-clip": "text",
						  "animation": "slide 2s linear infinite forwards"
					})
				} else if (curS >= 300){	
					$("div.strDisplay").css({
						"background": "repeating-linear-gradient(180deg, #9a9a9a, #b3b3b3, #c0c0c0, #dadada, #c0c0c0, #b3b3b3, #9a9a9a, #b3b3b3, #c0c0c0, #dadada, #c0c0c0, #b3b3b3, #9a9a9a, #b3b3b3, #c0c0c0, #dadada, #c0c0c0, #b3b3b3)",
						"background-size": "100% 24px",
						"-webkit-text-fill-color": "transparent",
						"-webkit-background-clip": "text",
						  "animation": "slide 2s linear infinite forwards"
					})
				} else if (curS >= 200) {
					$("div.strDisplay").css({
						"background": "repeating-linear-gradient(180deg, #d89000, #d8b400, #d8d855, #d8fcaa, #d8d855, #d8b400, #d89000, #d8b400, #d8d855, #d8fcaa, #d8d855, #d8b400, #d89000, #d8b400, #d8d855, #d8fcaa, #d8d855, #d8b400)",
						"background-size": "100% 24px",
						"-webkit-text-fill-color": "transparent",
						"-webkit-background-clip": "text",
						  "animation": "slide 2s linear infinite forwards"
					})		
				} else if (curS < 5){			
					$("div.strDisplay").css({
						"color": '#fcfcfc',
					})
				} else if (curS < 10){			
					$("div.strDisplay").css({
						"color": '#fcfc00',
					})
				} else if (curS < 25){			
					$("div.strDisplay").css({
						"color": '#d8fc00',
					})
				} else if (curS < 50){			
					$("div.strDisplay").css({
						"color": '#90fc00',
					})
				} else if (curS < 100){			
					$("div.strDisplay").css({
						"color": '#48fc00',
					})
				} else {			
					$("div.strDisplay").css({
						"color": '#00fc00',
					})
				} 
			};
			return neg+curStr.substr(curStr.length-4)+'/'+maxStr.substr(maxStr.length-4)			
		},
		arrangement: function() {
			if(this.song == null) {return null;}
			return poller.resolveArrangement(this.song, this.readout);
		},
        tuningName: function() {
            if(this.arrangement == null) {return null;}
			return this.arrangement.tuning.TuningName;		
        },
		sections: function() {
			const arrangement = this.arrangement;

			if(arrangement == null) {return null;}			
			
			const sections = arrangement.sections;

			const songLength = this.song.songLength;
			
			for (let i = 0; i < sections.length; i++) {
				const section = sections[i];

				section.length = section.endTime - section.startTime;

				section.startPercent = (section.startTime / songLength) * 100;
				
				//Always make the first section start from 0%
				if(i == 0) {
					section.length =  section.endTime;
					section.startPercent = 0;
				}

				section.endPercent = (section.endTime / songLength) * 100;

				section.lengthPercent = (section.length / songLength) * 100;

				section.style = {
					left: section.startPercent+'%',
					width: (section.lengthPercent-(100/(widthUI)))+'%',
				}
				
				if(this.readout.songTimer > section.startTime & this.readout.songTimer <= section.endTime){
					section.style.backgroundColor = '#486cff';
				}
				
				if (this.readout.songTimer > section.endTime | this.readout.gameStage == "panel_bib" | this.readout.gameStage == "sa_songreview" | this.readout.gameStage == "las_songreview"){				
					section.style.backgroundColor = accuracyGradient(tracker.getSectionAccuracy((section.startTime + section.endTime)/2));
				}

				sections[i] = section;
			}

			return sections;
		},
		phraseIterations: function() {
			const arrangement = this.arrangement;

			if(arrangement == null) {return null;}			
			
			const phraseIterations = arrangement.phraseIterations;

			const songLength = this.song.songLength;
					
			let maxDif = poller.getMaxDif();		
			
			for (let i = 0; i < phraseIterations.length; i++) {
				const phrase = phraseIterations[i];

				phrase.length = phrase.endTime - phrase.startTime;

				phrase.startPercent = (phrase.startTime / songLength) * 100;
				
				//Always make the first phrase start from 0%
				if(i == 0) {
					phrase.length =  phrase.endTime;
					phrase.startPercent = 0;
				}

				phrase.endPercent = (phrase.endTime / songLength) * 100;

				phrase.lengthPercent = (phrase.length / songLength) * 100;
				
				let phraseHeight = 1;
				
				if(phrase.maxDifficulty > maxDif){maxDif = phrase.maxDifficulty}
				
				if(maxDif != 0){
					phraseHeight = phrase.maxDifficulty/maxDif;
				}
				
				phrase.style = {
					left: phrase.startPercent+'%',
					width: (phrase.lengthPercent-(100/(widthUI)))+'%',
					height: Math.round((phraseHeight)*100)+'%'
				}

				if (this.readout.songTimer > phrase.endTime | this.readout.gameStage == "panel_bib" | this.readout.gameStage == "sa_songreview"  | this.readout.gameStage == "las_songreview"){
					if(tracker.getPhraseGrade((phrase.startTime + phrase.endTime)/2) != "No Data"){
						phrase.style.backgroundColor = gradeCode[tracker.getPhraseGrade((phrase.startTime + phrase.endTime)/2)];
					} else {
						phrase.style.backgroundColor = accuracyGradient(tracker.getPhraseAccuracy((phrase.startTime + phrase.endTime)/2));						
					}
				}
				phraseIterations[i] = phrase;
			}
			return phraseIterations;
		},
		/* PREV */
		prevSong: function() {
			if(!this.prevData) {
				return null;
			}
			return this.prevData.songDetails;
		},
		prevReadout: function() {
			if(!this.prevData) {
				return null;
			}

			return this.prevData.memoryReadout;
		},
		prevNotes: function() {
			const pr = this.prevReadout;
			if(!pr) {
				return null;
			}

			return pr.noteData;
		},	
		hitDisplayF: function(){
			$("div.hitDisplay").removeAttr('style');
			if(this.prevSong == null) {
				return '0100% 0000/0000';
				}
			if(this.prevNotes == null) {
				return '0100% 0000/0000';
				}
			let accHit = '0000';
			let notesHit = '0000';
			let totalNotes = '0000';
			const acc = this.prevNotes.Accuracy;
			if(acc == 100){
				accHit = accHit + '0100'
			}else{
				accHit = accHit + String(acc.toFixed(1));
			}
			notesHit = notesHit + String(this.prevNotes.TotalNotesHit);
			totalNotes = totalNotes + String(this.prevNotes.TotalNotes);		
			if(acc == 100){
				$("div.hitDisplay").css({
					  "background": "repeating-linear-gradient(180deg, #fc0000, #fc9000, #fcfc00, #00fc00, #00fcff, #fc00ff, #fc0000, #fc9000, #fcfc00, #00fc00)",
					  "background-size": "100% 48px",
					  "-webkit-text-fill-color": "transparent",
					  "-webkit-background-clip": "text",
					  "animation": "slide 1s linear infinite forwards"
				})				
			} else if (acc >= 99.8){
				$("div.hitDisplay").css({
					"background": "repeating-linear-gradient(180deg, #c1beba, #d9d8d4, #e5e4e2, #fdfdfd, #e5e4e2, #d9d8d4, #c1beba, #d9d8d4, #e5e4e2, #fdfdfd, #e5e4e2, #d9d8d4, #c1beba, #d9d8d4, #e5e4e2, #fdfdfd, #e5e4e2, #d9d8d4)",
					"background-size": "100% 24px",
					"-webkit-text-fill-color": "transparent",
					"-webkit-background-clip": "text",
					  "animation": "slide 2s linear infinite forwards"
				})					
			} else if (acc >= 99){
				$("div.hitDisplay").css({				
					"background": "repeating-linear-gradient(180deg, #fcb400, #fcd855, #fcfcaa, #fcfcfc, #fcfcaa, #fcd855, #fcb400, #fcd855, #fcfcaa, #fcfcfc, #fcfcaa, #fcd855, #fcb400, #fcd855, #fcfcaa, #fcfcfc, #fcfcaa, #fcd855)",
					"background-size": "100% 24px",
					"-webkit-text-fill-color": "transparent",
					"-webkit-background-clip": "text",
					  "animation": "slide 2s linear infinite forwards"
				})					
			} else if (acc >= 98){
				$("div.hitDisplay").css({
					"background": "repeating-linear-gradient(180deg, #9a9a9a, #b3b3b3, #c0c0c0, #dadada, #c0c0c0, #b3b3b3, #9a9a9a, #b3b3b3, #c0c0c0, #dadada, #c0c0c0, #b3b3b3, #9a9a9a, #b3b3b3, #c0c0c0, #dadada, #c0c0c0, #b3b3b3)",
					"background-size": "100% 24px",
					"-webkit-text-fill-color": "transparent",
					"-webkit-background-clip": "text",
					  "animation": "slide 2s linear infinite forwards"
				})					
			} else if (acc >= 97){
				$("div.hitDisplay").css({
					"background": "repeating-linear-gradient(180deg, #d89000, #d8b400, #d8d855, #d8fcaa, #d8d855, #d8b400, #d89000, #d8b400, #d8d855, #d8fcaa, #d8d855, #d8b400, #d89000, #d8b400, #d8d855, #d8fcaa, #d8d855, #d8b400)",
					"background-size": "100% 24px",
					"-webkit-text-fill-color": "transparent",
					"-webkit-background-clip": "text",
					  "animation": "slide 2s linear infinite forwards"
				})					
			} else if (acc == 0){				
				$("div.hitDisplay").css({
					"color": 'white',
				})
			} else {
				const accCol = accuracyGradient(acc);
				$("div.hitDisplay").css({
					"color": accCol,
				})
			}
			return accHit.substr(accHit.length-4)+'% '+notesHit.substr(notesHit.length-4)+'/'+totalNotes.substr(totalNotes.length-4);
		},			
		strDisplayF: function(){
			$("div.strDisplay").removeAttr('style');
			if(this.prevSong == null) {
				return '0000/0000';
				}
			if(this.prevNotes == null) {
				return '0000/0000';
				}
			const curStr = '0000'
			let maxStr = '0000'
			const maxS = this.prevNotes.HighestHitStreak;
			const totN = this.prevNotes.TotalNotes;
			maxStr = maxStr + String(maxS);
			const neg = '';	
			if(this.prevNotes.Accuracy == 100){
				$("div.strDisplay").css({
					  "background": "repeating-linear-gradient(180deg, #fc0000, #fc9000, #fcfc00, #00fc00, #00fcff, #fc00ff, #fc0000, #fc9000, #fcfc00, #00fc00)",
					  "background-size": "100% 48px",
					  "-webkit-text-fill-color": "transparent",
					  "-webkit-background-clip": "text",
					  "animation": "slide 1s linear infinite forwards"
				})					
			} else if (((1.5*maxS) >= totN  & maxS > 5) | maxS >= 500){			
				$("div.strDisplay").css({
					"background": "repeating-linear-gradient(180deg, #c1beba, #d9d8d4, #e5e4e2, #fdfdfd, #e5e4e2, #d9d8d4, #c1beba, #d9d8d4, #e5e4e2, #fdfdfd, #e5e4e2, #d9d8d4, #c1beba, #d9d8d4, #e5e4e2, #fdfdfd, #e5e4e2, #d9d8d4)",
					"background-size": "100% 24px",
					"-webkit-text-fill-color": "transparent",
					"-webkit-background-clip": "text",
					  "animation": "slide 2s linear infinite forwards"
				})
			} else if (((2*maxS) >= totN  & maxS > 5) | maxS >= 400){			
				$("div.strDisplay").css({
					"background": "repeating-linear-gradient(180deg, #fcb400, #fcd855, #fcfcaa, #fcfcfc, #fcfcaa, #fcd855, #fcb400, #fcd855, #fcfcaa, #fcfcfc, #fcfcaa, #fcd855, #fcb400, #fcd855, #fcfcaa, #fcfcfc, #fcfcaa, #fcd855)",
					"background-size": "100% 24px",
					"-webkit-text-fill-color": "transparent",
					"-webkit-background-clip": "text",
					  "animation": "slide 2s linear infinite forwards"
				})
			} else if (((3*maxS) >= totN  & maxS > 5) | maxS >= 300){			
				$("div.strDisplay").css({
					"background": "repeating-linear-gradient(180deg, #9a9a9a, #b3b3b3, #c0c0c0, #dadada, #c0c0c0, #b3b3b3, #9a9a9a, #b3b3b3, #c0c0c0, #dadada, #c0c0c0, #b3b3b3, #9a9a9a, #b3b3b3, #c0c0c0, #dadada, #c0c0c0, #b3b3b3)",
					"background-size": "100% 24px",
					"-webkit-text-fill-color": "transparent",
					"-webkit-background-clip": "text",
					  "animation": "slide 2s linear infinite forwards"
				})
			} else if (((4*maxS) >= totN  & maxS > 5) | maxS >= 200 ) {
				$("div.strDisplay").css({
					"background": "repeating-linear-gradient(180deg, #d89000, #d8b400, #d8d855, #d8fcaa, #d8d855, #d8b400, #d89000, #d8b400, #d8d855, #d8fcaa, #d8d855, #d8b400, #d89000, #d8b400, #d8d855, #d8fcaa, #d8d855, #d8b400)",
					"background-size": "100% 24px",
					"-webkit-text-fill-color": "transparent",
					"-webkit-background-clip": "text",
					  "animation": "slide 2s linear infinite forwards"
				})		
			} else if (maxS < 5){			
				$("div.strDisplay").css({
					"color": '#fcfcfc',
				})
			} else if (maxS < 10){			
				$("div.strDisplay").css({
					"color": '#fcfc00',
				})
			} else if (maxS < 25){			
				$("div.strDisplay").css({
					"color": '#d8fc00',
				})
			} else if (maxS < 50){			
				$("div.strDisplay").css({
					"color": '#90fc00',
				})
			} else if (maxS < 100){			
				$("div.strDisplay").css({
					"color": '#48fc00',
				})
			} else {			
				$("div.strDisplay").css({
					"color": '#00fc00',
				})
			};
		return neg+curStr.substr(curStr.length-4)+'/'+maxStr.substr(maxStr.length-4)			
		},
		
		prevArrangement: function() {
			if(this.prevSong == null) {return null;}
			if(this.prevSong.arrangements == null) {return null;}
			
			for (let i = this.prevSong.arrangements.length - 1; i >= 0; i--) {
				const arrangement = this.prevSong.arrangements[i];

				if(arrangement.arrangementID.length == 32 && arrangement.arrangementID == this.prevReadout.arrangementID) {
					return arrangement;
				}
			}
			return null;
		},
		
		prevPath: function() {
			if(this.prevArrangement == null){return null;}
			return this.prevArrangement.type;
		},
		
		prevSections: function() {
			const arrangement = this.prevArrangement;

			if(arrangement == null) {return null;}

			const sections = arrangement.sections;

			const songLength = this.prevSong.songLength;

			for (let i = 0; i < sections.length; i++) {
				const section = sections[i];

				section.length = section.endTime - section.startTime;

				section.startPercent = (section.startTime / songLength) * 100;
				
				//Always make the first section start from 0%
				if(i == 0) {
					section.length =  section.endTime;
					section.startPercent = 0;
				}

				section.endPercent = (section.endTime / songLength) * 100;

				section.lengthPercent = (section.length / songLength) * 100;

				section.style = {
					left: section.startPercent+'%',
					width: (section.lengthPercent-(100/(widthUI)))+'%'
				}
				

				if(tracker.hasPreviousBest()) {
					section.style.backgroundColor = (tracker.isBetterRelative((section.startTime + section.endTime)/2) ? '#00fc00' : '#fc0000');
				} else {						
					section.style.backgroundColor = accuracyGradient(tracker.getSectionAccuracy((section.startTime + section.endTime)/2));
				}
				

				sections[i] = section;
			}

			return sections;
		},
		
		prevPhrases: function() {
			const arrangement = this.prevArrangement;

			if(arrangement == null) {return null;}

			const phraseIterations = arrangement.phraseIterations;

			const songLength = this.prevSong.songLength;
			
			let maxDif = poller.getMaxDif();		
			
			for (let i = 0; i < phraseIterations.length; i++) {
				const phrase = phraseIterations[i];

				phrase.length = phrase.endTime - phrase.startTime;

				phrase.startPercent = (phrase.startTime / songLength) * 100;
				
				//Always make the first phrase start from 0%
				if(i == 0) {
					phrase.length =  phrase.endTime;
					phrase.startPercent = 0;
				}

				phrase.endPercent = (phrase.endTime / songLength) * 100;

				phrase.lengthPercent = (phrase.length / songLength) * 100;
				
				let phraseHeight = 1;
				
				if(phrase.maxDifficulty > maxDif){maxDif = phrase.maxDifficulty}
				
				if(maxDif != 0){
					phraseHeight = phrase.maxDifficulty/maxDif;
				}
				
				phrase.style = {
					left: phrase.startPercent+'%',
					width: (phrase.lengthPercent-(100/(widthUI)))+'%',
					height: Math.round((phraseHeight)*100)+'%'
				}
				
				if(tracker.getPhraseGrade((phrase.startTime + phrase.endTime)/2) != "No Data"){
					phrase.style.backgroundColor = gradeCode[tracker.getPhraseGrade((phrase.startTime + phrase.endTime)/2)];
				} else {
					phrase.style.backgroundColor = accuracyGradient(tracker.getPhraseAccuracy((phrase.startTime + phrase.endTime)/2));						
				}

				phraseIterations[i] = phrase;
			}

			return phraseIterations;
		}
	}
});

function formatTimer(time) {
	if(time < 0) {
		return "";
	}

	const minutes = Math.floor(time/60);
	const seconds = time % 60;

	return [minutes,seconds].map(X => ('0' + Math.floor(X)).slice(-2)).join(':')
}

let hideTimeout = null;
function generateFeedback() {
	app.feedback = [];

	const arrangement = poller.getCurrentArrangement();
	//Can be unresolved at Nonstop Play song changes
	if(arrangement == null) {
		app.feedback = ["YOU TRIED!"];
		app.cycleFeedback();
		hideTimeout = setTimeout(() => {if(app.mode == 1) {app.mode = 0; app.visible = false;}}, 60000);
		return;
	}
	const sections = arrangement.sections;
	const feedback = []

	let greens = 0;

	for (let i = sections.length - 1; i >= 0; i--) {
		const section = sections[i];
		const rel = tracker.getRelative(section.endTime);

		if(rel == null) {
			continue;
		}

		if(rel.Accuracy >= 0) {
			greens++;
		}

		if(rel.Accuracy >= 1) {
			feedback.push(rel.Accuracy.toFixed(1)+"% better accuracy in "+section.name);
		}
		if(rel.TotalNotesHit > 2) {
			feedback.push("Hit "+rel.TotalNotesHit+" more notes in "+section.name);
		}
	}

	if(greens > 0) {
		feedback.push(greens+" green sections");
	}

	feedback.sort(() => Math.random() - 0.5);

	if(poller.getCurrentAccuracy() == 100) {
		feedback.push("GOT A FULL COMPLETE!");
	}

	if(feedback.length == 0) {
		feedback.push("YOU TRIED!");
	}

	app.feedback = feedback;

	app.cycleFeedback();

	hideTimeout = setTimeout(() => {if(app.mode == 1) {app.mode = 0; app.visible = false;}}, 60000);
}

poller.enableResultsHold(app);
