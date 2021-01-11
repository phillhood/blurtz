import styled from 'styled-components';
import { PILE_TYPES } from '../../constants';

const { WOOD, BLITZ, DISCARD } = PILE_TYPES;

export const SinglePile = styled.div`
  & {
    display: flex;
    border: 2px solid black;
    border-radius: 10px;
    background: ${({ type }) => {
      switch (type) {
        case WOOD:
          return 'gray';
        case BLITZ:
          return 'gold';
        case DISCARD:
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
