import styled from 'styled-components';
import { CARD_DIMENSIONS } from '../../constants';

export const Cardface = styled.div`
  background-color: ${({ colour }) => colour};
  border: 5px solid ${({ type }) => (type === 'm' ? 'black' : 'white')};
  border-radius: 15px;
  box-sizing: border-box;
  font-size: 72px;
  font-family: 'Germania One';
  -webkit-text-stroke: 1px black;
  color: white;
  font-weight: bold;
  text-align: center;
  vertical-align: middle;
  box-shadow: 0 0 15pt -5pt black;
  width: 100%;
  height: 100%;
  opacity: ${({ opacity }) => {
    opacity;
  }};
  ${'' /* margin: auto; */}
  position: ${({ stack }) => {
    if (stack) {
      return 'absolute';
    } else {
      return '';
    }
  }};
  display: block;
  bottom: ${({ stack }) => {
    if (stack > 1) {
      return `${(stack - 1) * -10}px`;
    } else {
      return '0';
    }
  }};
  left: ${({ stack }) => {
    if (stack > 1) {
      return `${stack * 10}px`;
    } else {
      return '0';
    }
  }};
  right: ${({ stack }) => {
    if (stack > 1) {
      return `${(stack - 1) * 10}px`;
    } else {
      return '0';
    }
  }};
  top: ${({ stack }) => {
    if (stack > 1) {
      return `${(stack - 1) * 10}px`;
    } else {
      return '0';
    }
  }};
  margin-left: ${({ stack }) => {
    if (stack > 1) {
      return `-10px`;
    } else {
      return;
    }
  }};
`;

export const Cardback = styled.div`
  background: black;
  border-radius: 5px;
  box-sizing: border-box;
  font-size: 72px;
  font-family: 'Germania One';
  -webkit-text-stroke: 1px black;
  color: white;
  font-weight: bold;
  text-align: center;
  vertical-align: middle;
  outline: none;
  width: 90%;
  height: 90%;
  margin: auto;
`;

export const Value = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
`;
