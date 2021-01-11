// import { shallowCopy } from 'immer/dist/internal';
import React from 'react';
import { useSelector } from 'react-redux';
import { Game } from '../../components';

const GameContainer = () => {
  const enableSettings = useSelector(
    (rootState) => rootState.control.enableSettings
  );
  const width = useSelector((rootState) => rootState.control.width);
  const height = useSelector((rootState) => rootState.control.height);

  return <>{!enableSettings && <Game width={width} height={height} />}</>;
};

export default GameContainer;
