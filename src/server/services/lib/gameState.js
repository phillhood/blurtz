import _ from 'lodash';

import Player from './player.js';

export default class GameState {
  constructor(playerIds) {
    this.players = _.keyBy(
      _.map(playerIds, (id) => {
        return new Player(id);
      }),
      'id'
    );
  }
}
