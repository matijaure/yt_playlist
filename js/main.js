yp.scripts.main = function() {

//this lets us reload main without having multiple copies running at once
if(!yp.main_count) yp.main_count = 0;

let timestr = function(seconds) {
  //https://stackoverflow.com/questions/6312993/javascript-seconds-to-time-string-with-format-hhmmss
  seconds = Math.floor(seconds);
  const minutes = Math.floor(seconds / 60);
  let remainder = seconds % 60;
  if (remainder < 10) {remainder = "0"+remainder;}
  return minutes + ":" + remainder;
};

let curTimeAdj = function() {
  const song = yp.player.get_cur_alternative();
  const playTime = yp.player.p.getCurrentTime();
  if(song.start) {
    return playTime - song.start;
  }
  return playTime;
};

let fullTimeAdj = function() {
  const song = yp.player.get_cur_alternative();
  let fullTime = yp.player.p.getDuration();
  if(song.end) {
    fullTime = song.end;
  }
  if(song.start) {
    fullTime -= song.start;
  }
  return fullTime;
};

let main = function() {
  //run every frame, unless there was a reload
  if(main_id === yp.main_count) {
    window.requestAnimationFrame( main );
  }
  if(yp.player && yp.player.ready) {
    let player = yp.player;
    //display info
    if(yp.info) {
      yp.info.display_info();
    }
    //display song time
    const curTime = timestr(curTimeAdj() || 0);
    const fullTime = timestr(fullTimeAdj() || 0);
    document.getElementById("time").innerHTML = curTime + " / " + fullTime;
    //check if a video has failed
    if(player.p.getPlayerState() === -1) {
      if(performance.now() - player.fail_timeout > 8000) {
        if(yp.info) {
          yp.info.debug("Failed to load: " + JSON.stringify(yp.info.cur_info));
        }
        player.try_alternative();
      }
    }
  }
};
//start running
yp.main_count++;
let main_id = yp.main_count;
main();

};