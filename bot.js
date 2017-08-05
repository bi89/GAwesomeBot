/* eslint-disable max-len */
const database 		= require("./Database/Driver.js");
const auth 				= require("./Configurations/auth.js");
const configJS 		= require("./Configurations/config.js");
const configJSON	= require("./Configurations/config.json");
const Discord			= require("discord.js");
const { Console, SharderIPC, Sharder } = require("./Modules/");
const cluster			= require("cluster");

// Set up a winston instance for the Master Process
global.winston = new Console("master");

winston.info(`Logging to ${require("path").join(process.cwd(), `logs/master-gawesomebot.log`)}.`);

winston.debug("Connecting to MongoDB... ~(˘▾˘~)", { url: configJS.databaseURL });
database.initialize(configJS.databaseURL).catch(err => {
	winston.error(`An error occurred while connecting to MongoDB! x( Is the database online?\n`, err);
	process.exit(-1);
}).then(async () => {
	const db = database.getConnection();
	if (db) {
		await winston.info(`Connected to the database successfully.`);
		winston.verbose("Confirming MongoDB config values... ~(˘▾˘~)");
		await db.db.db("admin").command({ getCmdLineOpts: 1 }).then(res => {
			if (!res.parsed || !res.parsed.net || !res.parsed.net.bindIp) {
				winston.warn("Your MongoDB instance appears to be opened to the wild, wild web. Please make sure authorization is enforced!");
			}
		});
		winston.silly("Confirming clientToken config value.");
		if (!auth.discord.clientToken) {
			winston.error("You must provide a clientToken in \"Configurations/auth.js\" to open the gates to Discord! -.-");
			return;
		}
		winston.silly("Confirming shardTotal config value.");
		if (configJS.shardTotal !== "auto" && configJS.shardTotal < 1) {
			winston.error(`In config.js, shardTotal must be greater than or equal to 1`);
		}
		winston.debug("Creating sharder instance.");
		const sharder = await new Sharder(auth.discord.clientToken, configJS.shardTotal, winston);
		sharder.cluster.on("online", worker => {
			winston.info(`Worker ${worker.id} launched.`, { worker: worker.id });
		});
		await sharder.IPC.listen();
		// Sharder events
		sharder.ready = 0;
		sharder.finished = 0;
		sharder.IPC.on("ready", () => {
			sharder.ready++;
			if (sharder.ready === sharder.count) {
				winston.info("All shards connected.");
			}
		});
		sharder.IPC.once("warnDefaultSecret", () => {
			winston.warn("Your secret value appears to be set to the default value. Please note that this value is public, and your session cookies can be edited by anyone!");
		});
		function shardFinished() {
			const ascii = `
  _____                                               ____        _   
 / ____|   /\\                                        |  _ \\      | |  
| |  __   /  \\__      _____  ___  ___  _ __ ___   ___| |_) | ___ | |_ 
| | |_ | / /\\ \\ \\ /\\ / / _ \\/ __|/ _ \\| '_ \` _ \\ / _ \\  _ < / _ \\| __|
| |__| |/ ____ \\ V  V /  __/\\__ \\ (_) | | | | | |  __/ |_) | (_) | |_ 
 \\_____/_/    \\_\\_/\\_/ \\___||___/\\___/|_| |_| |_|\\___|____/ \\___/ \\__|																																		 	
			`;
			sharder.finished++
			if (sharder.finished === sharder.count) {
				// Print startup ascii message
				winston.info(`The best Discord Bot, version ${configJSON.version}, is now ready!`);
				// Use console.log because winston never lets us have anything fun, MOM
				console.log(ascii);
				sharder.removeListener("finished", shardFinished);
			}
		};
		sharder.IPC.on("finished", shardFinished);
		sharder.spawn();
	}
});
