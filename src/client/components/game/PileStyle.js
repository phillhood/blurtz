import styled from 'styled-components';
import { PILE_TYPES } from '../../constants';

const { POST, BLITZ, DUTCH, WOOD } = PILE_TYPES;

export const SinglePile = styled.div`
  & {
    display: flex;
    position: relative;
    border: ${({ type, cards }) =>
      (!cards.cards.length && type === DUTCH) || type === WOOD
        ? '2px solid black'
        : ''};
    border-radius: 15px;
    left: ${({ type }) => {
      switch (type) {
        case WOOD:
          return '-10px';
        default:
          return;
      }
    }};
    background: ${({ type }) => {
      switch (type) {
        case POST:
          return 'saddlebrown';
        case BLITZ:
          return 'gold';
        case WOOD:
          return 'lime';
      }
    }};
  }
  &:before {
    content: '';
    display: block;
    height: 0;
    width: 0;
    padding-bottom: calc(14 / 10 * 100%);
  }
`;
