import styled from 'styled-components';
import { PILE_TYPES } from '../../constants';

const { WOOD, BLITZ, DISCARD } = PILE_TYPES;

export const SinglePile = styled.div`
  & {
    display: flex;
    position: relative;
    ${'' /* padding: 4px; */}
    ${'' /* border: 2px solid black; */}
    border-radius: 15px;
    ${'' /* box-shadow: 0 30px 40px rgba(0, 0, 0, 0.1); */}
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
