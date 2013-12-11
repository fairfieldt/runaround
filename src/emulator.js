var $ = require('jash');
var async = require('async');

var Emulator = exports.Emulator = function(opts) {
	//TODO require avdName and port
	//TODO can we support real devices
	//TODO just find an open port
	this._avdName = opts.avd;
	this._extra = opts.extra || [];
	this._port = opts.port || (Math.random() * 30 + 5554 | 0);
	this._serial = 'emulator-' + this._port;
	console.log(this._serial);
};

Emulator.prototype.start = function(cb) {
	var opts = this._extra.slice();
	opts.unshift(this._port);
	opts.unshift('-port');
	opts.unshift(this._avdName);
	opts.unshift('-avd');
	var emulatorProcess = $.emulator(opts)

	emulatorProcess.stdout.on('data', function(d) { console.log(d.toString()); });	
	emulatorProcess.on('exit', function() {
		//TODO handle this
		console.log('exit', arguments);
	});
	var timeout = 3 * 60 * 1000;
	var serial = this._serial;
	async.series([
		tryFor(waitForDeviceOnline, this._serial, timeout),
		restartAdb,
		tryFor(waitForProp, serial, 'sys.boot_completed', 1, timeout),
		tryFor(waitForProp, serial, 'init.svc.bootanim', 'stopped', timeout),
		restartAdb,
		tryFor(waitForPackageManager, this._serial, timeout)
	], function() {
		cb && cb(null);
	});
};

Emulator.prototype.installAndRunPackage = function(apkPath, cb) {
	console.log('installing', apkPath);
	this.installPackage(apkPath, (function(error) {
		console.log('error', error);
		if (!error) {
			console.log('installed ok');
			getActivityFromApk(apkPath, (function(error, activity) {
				console.log('activityName is ', error, activity);
				if (!error) {
					console.log('unlocking');
					this.unlock((function(error) {
						if (!error) {
							console.log('running');
							this.runActivity(activity, cb);	
						} else {
							console.log('error unlocking', error);
							cb(new Error('Error Unlocking Screen'));
						}
					}).bind(this));
				} else {
					var message = 'Error getting activity from apk: ' +
						apkPath + ' ' + error;;
					console.log(message);
					cb(new Error(message));
				}
			}).bind(this));
		} else {
			console.log('error', error);
			console.log(arguments);
			cb(new Error('Error installingPackage: ' + apkPath));
		}
	}).bind(this));
};

Emulator.prototype.install = function(apkPath, run, cb) {
	if (run) {
		this.installAndRunPackage(apkPath, cb);
	} else {
		this.installPackage(apkPath, cb);
	}
};

Emulator.prototype.installPackage = function(apkPath, cb) {
	$.adb('-s', this._serial, 'install', '-r', apkPath, cb);
};

Emulator.prototype.runActivity = function(activityName, cb) {
	//am start -n yourpackagename/.activityname
	console.log('starting', activityName);
	$.adb('-s', this._serial, 'shell', 'am', 'start', activityName, cb);
};

Emulator.prototype.unlock = function(cb) {
	$.adb('-s', this._serial, 'shell', 'input', 'keyevent', '82', cb);
};


/*
* fn takes a final parameter, timer, which will have timer.fired
* keep running until timer.fired === true
* when the desired state is hit, call timer.clear()
* to go to the next iteration, call timer.next(interval)
*
*/
var tryFor = function() {
	var args = Array.prototype.slice.call(arguments, 1, -1);
	var fn = arguments[0];
	var timeout = arguments[arguments.length-1];
	return function(cb) {
		var endTime = +new Date() + timeout;
		var timeoutId;
		var timer = {
			fired: false,
			clear: function() {
				clearInterval(intervalId);
				clearTimeout(timeoutId);
			},
			next: function(interval) {
				timeoutId = setTimeout(function() {
					fn.apply(this, args);
				}, interval);
			}
		};
		args.push(timer);
		args.push(cb);
		var intervalId = setInterval(function() {
			if (endTime <= +new Date()) {
				timer.fired = true;
				clearInterval(intervalId);
				clearTimeout(timeoutId);
			}
		}, 100);
		fn.apply(this, args);
	}
};

var waitForDeviceOnline = function(serial, timer, cb) {
	$.adb('devices', function(status, out, err) {
		if (!status) {
			var devices = out.split('\n');
			var matches = devices.filter(function(line) {
				var match =  /^(.*)\s+(.*)$/.exec(line);
				return match && match[1] == serial && match[2] == 'device';
			});
			if (matches.length) {
				console.log('Device', serial, 'is online!');
				timer.clear();
				cb(null);
			} else if (timer.fired) {
				console.log('waitForDeviceOnline timed out');
				cb(new Error('waiting for device timeout'));
			} else {
				timer.next(500);
			}
		}
	});
};

var getProp = function(emulatorId, propName, cb) {
	$.adb('-s', emulatorId, 'shell', 'getprop', propName,
		function(status, out, err) {
			out = out && out.split('\r')[0];
			cb(status, out);
		}
	);
};
var waitForProp = function(emulatorId, propName, expectedStatus, timer, cb) {
	getProp(emulatorId, propName, function(error, prop) {
		if (prop == expectedStatus) {
			console.log('Success:', propName, 'is', expectedStatus);
			timer.clear();
			cb(null, prop);
		} else if (timer.fired) {
			var message = 'timed out waiting for ' + propName +
					'to be' + expectedStatus;
			console.log(message);
			cb(new Error(message));
		} else {
			timer.next(500);
		}
	});
};

var waitForPackageManager = function(emulatorId, timer, cb) {
	$.adb('-s', emulatorId, 'shell', 'pm path android',
		function(status, out, err) {
			if (!status && /^package/.exec(out)) {
				cb(null, out);
				timer.clear();
			} else if (timer.fired) {
				cb(new Error('Timed out waiting for package manager'));
			} else {
				timer.next(500);
			}
		}
	);
};

var restartAdb = function(cb) {
	var p = $.adb('kill-server', function(status, out, err) {
		console.log(status, out, err);
		if (status) {
			console.log('error killing adb', status, err);
			cb(new Error('Error killing adb'));
		} else {
			setTimeout(function() {
				$.adb('start-server', function(status, out, err) {
					if (status) {
						console.log('error starting adb', status, out, err);
						cb(new Error('Error starting adb'));
					} else {
						cb(null);
					};
				});
			}, 1000);
		}
	});
};

var getActivityFromApk = function(apkPath, cb) {
	$.aapt('dump', 'badging', apkPath, function(status, out, err) {
		if (!status) {
			var activity = /launchable-activity:\s+name=\'([^\']+)/.exec(out);
			var package = /package:\s+name=\'([^\']+)/.exec(out);
			if (package && activity) {
				var fullActivityName = package[1] + '/' + activity[1];
				console.log(fullActivityName)
				cb(null, fullActivityName);
				return;
			}
		}
		console.log(out, err);
		cb(new Error('Error finding launchable activity from ' + apkPath));
	});
};
