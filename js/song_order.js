yp.scripts.song_order = function() {

const song_order = {};
if(!yp.song_order) {
    song_order.cur_song_index = -1;

    yp.song_order = song_order;
}
else {
    song_order = yp.song_order;
}

song_order.max_queue_length = 100;
song_order.queue_limit_percent = 0.4;

//load the song queue if it exists
const queue_string = namedstore.getItem('recent_queue');
if(queue_string) {
    try {
        song_order.recent_song_queue = JSON.parse(namedstore.getItem('recent_queue'));
    }
    catch(err) {
        song_order.recent_song_queue = []
    }
}
else {
    song_order.recent_song_queue = []
}

// add the song, and boot out anything above the limit
song_order.add_to_song_queue = function(song_index) {
    song_order.recent_song_queue.unshift(song_index);
    if(song_order.recent_song_queue.length > song_order.max_queue_length) {
        song_order.recent_song_queue.pop();
    }
    namedstore.setItem('recent_queue', JSON.stringify(song_order.recent_song_queue));
};



//https://stackoverflow.com/questions/3746725/create-a-javascript-array-containing-1-n
song_order.basic_order = [...Array(yp.song_data.length).keys()];
song_order.shuffled_order = song_order.basic_order.slice();
//https://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array
song_order.shuffled_order.shuffle_me = (function() {
    let a = this;
    let j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
});
song_order.shuffled_order.shuffle_me();

const weighted_select = function(items, weights, rand=Math.random) {
    const accumulative_lower = [];
    const accumulative_upper = [];
    const length = Math.min(items.length, weights.length);
    let total_weight = 0;
    for(let index = 0; index < length; index++) {
        accumulative_lower[index] = total_weight;
        total_weight += weights[index];
        accumulative_upper[index] = total_weight;
    }

    const random_point = rand() * total_weight;
    let guess = Math.floor((random_point / total_weight) * length);

    //binary search
    let low = 0;
    let high = length - 1;
    while(low <= high) {
        if(accumulative_lower[guess] <= random_point
        && random_point < accumulative_upper[guess]) {
            return { item: items[guess], index: guess };
        }
        if(random_point < accumulative_lower[guess]) {
            high = guess - 1;
        }
        if(accumulative_upper[guess] <= random_point) {
            low = guess + 1;
        }
        guess = Math.floor((high + low) / 2);
    }
};
song_order.weighted_select = weighted_select;


song_order.get_next_song = function() {

    const order_option = yp.player.song_order;
    const song_data = yp.song_data;
    const song_order = yp.song_order;

    switch(order_option) {
        case "organized":
            song_order.cur_song_index = (song_order.cur_song_index + 1) % song_data.length;
            return song_order.basic_order[song_order.cur_song_index];
        case "shuffle":
            song_order.cur_song_index++;
            if(song_order.cur_song_index >= song_data.length) {
              song_order.cur_song_index = 0;
              song_order.shuffled_order.shuffle_me();
            };
            return song_order.shuffled_order[song_order.cur_song_index];
        case "random":
        case "weighted":
            //get a set of songs allowed by the current tags
            let allowed_songs = undefined;
            if(yp.tag_data) {
                allowed_songs = new Set( yp.tag_data.filtered_set() );
            }
            else {
                allowed_songs = new Set( song_data.map( (song) => song.index ) );
            }
            //remove the songs that have played recently
            const limit = Math.floor( (allowed_songs.size) * song_order.queue_limit_percent );
            for(let i = 0; i < limit && i < song_order.recent_song_queue.length; i++) {
                allowed_songs.delete( song_order.recent_song_queue[i] );
            }
            const allowed_list = Array.from(allowed_songs);
            if(order_option == "random") {
                return allowed_list[ Math.floor(Math.random() * allowed_list.length) ];
            }
            else {
                const weights = allowed_list.map( (index) => yp.song_weights[index] );
                return weighted_select(allowed_list, weights).item;
            }
        default:
            return 0;
    }
};

};
