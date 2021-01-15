import styled from 'styled-components';
import { PILE_TYPES } from '../../constants';

const { WOOD, BLITZ, DISCARD } = PILE_TYPES;

export const SinglePile = styled.div`
  & {
    display: flex;
    position: relative;
    ${'' /* border: 2px solid black; */}
    border-radius: 15px;
    left: ${({ type }) => {
      switch (type) {
        case DISCARD:
          return '-10px';
        default:
          return;
      }
    }};
    ${
      '' /* top: ${({ type }) => {
      switch (type) {
        case DISCARD:
          return '-10px';
        default:
          return;
      }
    }}; */
    }
    background: ${({ type }) => {
      switch (type) {
        case WOOD:
          return 'saddlebrown';
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
