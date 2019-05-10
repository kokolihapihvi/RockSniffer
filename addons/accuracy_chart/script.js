var prevBest = [];
var currentAttempt = [];
var betterTicks = [];
var worseTicks = [];
var myChart = null;

var storage = new SnifferStorage("accuracy_chart");

var poller = new SnifferPoller({
	onData: function(data) {
		if(poller.getCurrentState() == STATE_SONG_STARTING || poller.getCurrentState() == STATE_SONG_PLAYING || poller.getCurrentState() == STATE_SONG_ENDING) {
			setCurrentAttempt(poller.getSongTimer(), poller.getCurrentAccuracy());
		}
	},
	onSongStarted: function(song) {
		prevBest.length = 0;
		currentAttempt.length = 0;
		betterTicks.length = 0;
		worseTicks.length = 0;

		var arr_id = poller.getCurrentArrangement().arrangementID;

		storage.getValue(song.songID+"_"+arr_id).done(function(data) {
			var parsed = JSON.parse(data);

			if(parsed != null) {
				setPrevBest(parsed);
			}
		});
	},
	onSongEnded: function(song) {
		var arr_id = poller.getCurrentArrangement().arrangementID;

		if(prevBest.length <= 1) {
			storage.setValue(song.songID+"_"+arr_id, currentAttempt);
			console.log("Storing first attempt");
			return;
		}

		console.log("Current attempt: ",currentAttempt.slice(-1).pop().y);
		console.log("Best attempt: ",prevBest.slice(-1).pop().y);
		
		if(currentAttempt.slice(-1).pop().y > prevBest.slice(-1).pop().y) {
			storage.setValue(song.songID+"_"+arr_id, currentAttempt);
			console.log("Storing better attempt");
		}
	}
});

function setCurrentAttempt(time, accuracy) {
	var t = Math.floor(time);

	for (var i = 0; i < t; i++) {
		if(!currentAttempt[i]) {
			currentAttempt[i] = {x: i, y: accuracy};
		}
		if(!betterTicks[i]) {
			betterTicks[i] = null;
		}
		if(!worseTicks[i]) {
			worseTicks[i] = null;
		}
	}

	currentAttempt[t] = {x: t, y: accuracy}

	betterTicks[t] = null;
	worseTicks[t] = null;

	if(prevBest[t]) {
		if(currentAttempt[t].y >= prevBest[t].y) {
			betterTicks[t] = currentAttempt[t];
		} else {
			worseTicks[t] = currentAttempt[t];
		}
	}

	myChart.resetZoom();
	myChart.doPan(myChart.scales["x-axis-0"].getPixelForValue(-t), (myChart.height / 2) - myChart.scales["y-axis-0"].getPixelForValue(accuracy));

	myChart.doZoom(1.8, 1.5, {x: myChart.scales["x-axis-0"].getPixelForValue(t), y: myChart.scales["y-axis-0"].getPixelForValue(accuracy)});
	myChart.doPan((myChart.width*0.7), 0);

	myChart.update();
}

function setPrevBest(pb) {
	prevBest.length = 0;

	for (var i = 0; i < pb.length; i++) {
		prevBest.push(pb[i]);
	}

	myChart.update();
}

$(function() {
	var ctx = document.getElementById('acc_chart').getContext('2d');
	myChart = new Chart(ctx, {
		type: 'line',
		data: {
			datasets: [{
				label: "Previous Best",
				data: prevBest,
				backgroundColor: 'rgba(99, 132, 255, 0.4)',
				borderColor: 'rgba(255, 99, 132, 0)',
				borderWidth: 1,
				fill: "origin"
			},{
				label: "Current attempt",
				data: currentAttempt,
				borderColor: 'rgba(99, 132, 132, 1)',
				borderWidth: 1
			},
			{
				label: "Worse ticks",
				data: worseTicks,
				backgroundColor: 'rgba(255, 99, 132, 1)',
				fill: 0
			},
			{
				label: "Better ticks",
				data: betterTicks,
				backgroundColor: 'rgba(99, 255, 132, 1)',
				fill: 0
			}]
		},
		options: {
			animation: false,
			maintainAspectRatio: false,
			legend: {
				display: false
			},
			scales: {
				yAxes: [{
					ticks: {
						min: 0,
						max: 100,
						beginAtZero: true
					}
				}],
				xAxes: [{
					type: "linear",
					ticks: {
						min: 0,
						minRotation: 0,
						maxRotation: 0,
						callback: function(value, index, values) {
							var minutes = Math.floor(value/60);
							var seconds = value % 60;

							if(value < 0) {
								return "";
							}

							return [minutes,seconds].map(X => ('0' + Math.floor(X)).slice(-2)).join(':')
						}
					}
				}]
			},
			elements: {
				line: {
					tension: 0
				},
				point: {
					radius: 0
				}
			},
			plugins: {
				zoom: {
					pan: {
						enabled: true,
						mode: 'xy',
						speed: 10,
						threshold: 10
					},
					zoom: {
						enabled: true,
						mode: 'xy'
					}
				},
			}
		},
		plugins: [
			{
				afterDatasetsDraw: function(chartInstance) {
					var ctx = chartInstance.chart.ctx;
					var chartArea = chartInstance.chartArea;

					if(currentAttempt.length == 0) {
						return;
					}

					ctx.save();

					var pt = currentAttempt.slice(-1)[0];
					var x = chartInstance.scales["x-axis-0"].getPixelForValue(pt.x);
					var y = chartInstance.scales["y-axis-0"].getPixelForValue(pt.y);

					var text = pt.y+"%";
					var textColor = "black";
					var fontSize = 30;

					if(prevBest.length > 0) {
						var bpt = prevBest[pt.x];

						if(bpt.y > pt.y) {
							textColor = "red";
							text = (pt.y-bpt.y).toFixed(2)+"%";
						} else {
							textColor = "green";
							text = "+"+(pt.y-bpt.y).toFixed(2)+"%";
						}

					}

					ctx.font = fontSize+"px Arial";
					var textSize = ctx.measureText(text);

					var arrangement = poller.getCurrentArrangement();

					if(arrangement) {
						for (var i = 0; i < arrangement.sections.length; i++) {
							var section = arrangement.sections[i];

							var start = chartInstance.scales["x-axis-0"].getPixelForValue(section.startTime);
							var end = chartInstance.scales["x-axis-0"].getPixelForValue(section.endTime);

							ctx.fillStyle = "black";
							ctx.fillText(section.name, start, 30);

							ctx.moveTo(start, 0);
							ctx.lineTo(start, chartInstance.height);
							ctx.stroke();

							ctx.moveTo(end, 0);
							ctx.lineTo(end, chartInstance.height);
							ctx.stroke();
						}
					}

					ctx.translate(10,-fontSize/2)

					ctx.fillStyle = textColor;
					ctx.fillText(text, x, y+fontSize-4);

					ctx.restore();
				}
			}
		]
	});
});