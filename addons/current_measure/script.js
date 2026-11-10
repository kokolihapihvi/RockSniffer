const poller = new SnifferPoller({
	interval: 500,

	onData: function(data) {
		const time = data.memoryReadout.songTimer;
		const arr = poller.getCurrentArrangement();

		if(arr == null) {
			$(".measure").text("-");
			return;
		}

		const measures = arr.data.Measures;

		for (let i = measures.length - 1; i >= 0; i--) {
			if(measures[i].Time <= time) {
				$(".measure").text(poller.getCurrentSection().name+" | "+measures[i].Number);
				break;
			}
		}
	},
	onSongStarted: function(data) {
		$(".measure").text("0");
	},
	onSongEnded: function(data) {
		$(".measure").text("-");
	}
});