import styled from 'styled-components';
import { CARD_DIMENSIONS } from '../../constants';

export const Discard = styled.div`
  display: inline;
  width: ${CARD_DIMENSIONS.WIDTH}px;
  height: ${({ length }) => {
    return CARD_DIMENSIONS.HEIGHT + (length > 1 ? length * 20 : 0);
  }}px;
  border: 2px solid black;
  border-radius: 10px;
  background: lime;
`;

export const Wood = styled.div`
  display: inline;
  width: ${CARD_DIMENSIONS.WIDTH}px;
  height: ${({ length }) => {
    return CARD_DIMENSIONS.HEIGHT + (length > 1 ? length * 20 : 0);
  }}px;
  border: 2px solid black;
  border-radius: 10px;
  background: brown;
`;

export const Blitz = styled.div`
  display: inline;
  border: 2px solid black;
  border-radius: 10px;
  background: gold;
  width: ${CARD_DIMENSIONS.WIDTH}px;
  height: ${CARD_DIMENSIONS.HEIGHT}px;
`;

export const Dutch = styled.div`
  display: inline;
  border: 2px solid black;
  border-radius: 10px;
  width: ${CARD_DIMENSIONS.WIDTH}px;
  height: ${CARD_DIMENSIONS.HEIGHT}px;
`;
