import styled from 'styled-components';
import { CARD_DIMENSIONS } from '../../constants';

export const Cardface = styled.div`
  background-color: ${({ cardColour }) => cardColour.code};
  border: 3px solid
    ${({ cardColour }) => (cardColour.type === 'm' ? 'black' : 'white')};
  border-radius: 5px;
  box-sizing: border-box;
  colour: white;
  display: block;
  font-size: 18px;
  font-weight: bold;
  outline: none;
  width: ${CARD_DIMENSIONS.WIDTH}px;
  height: ${CARD_DIMENSIONS.HEIGHT}px;
`;
