import styled from 'styled-components';
import { CARD_DIMENSIONS } from '../../constants';

export const Discard = styled.div`
  & {
    display: flex;
    border: 2px solid black;
    border-radius: 10px;
    background: lime;
  }
  &:before {
    content: '';
    display: block;
    height: 0;
    width: 0;
    padding-bottom: calc(14 / 10 * 100%);
  }
`;

export const Wood = styled.div`
  & {
    display: flex;
    border: 2px solid black;
    border-radius: 10px;
    background: brown;
  }
  &:before {
    content: '';
    display: block;
    height: 0;
    width: 0;
    padding-bottom: calc(14 / 10 * 100%);
  }
`;

export const Blitz = styled.div`
  & {
    display: flex;
    border: 2px solid black;
    border-radius: 10px;
    background: gold;
  }
  &:before {
    content: '';
    display: block;
    height: 0;
    width: 0;
    padding-bottom: calc(14 / 10 * 100%);
  }
`;

export const Dutch = styled.div`
  & {
    display: flex;
    border: 2px solid black;
    border-radius: 10px;
    background: white;
  }
  &:before {
    content: '';
    display: block;
    height: 0;
    width: 0;
    padding-bottom: calc(14 / 10 * 100%);
  }
`;
