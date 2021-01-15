import styled from 'styled-components';
import { PILE_TYPES } from '../../constants';

export const Cardface = styled.div`
  background-color: ${({ colour }) => colour.code};
  border: 5px solid ${({ colour }) => (colour.type === 'm' ? 'black' : 'white')};
  border-radius: 15px;
  box-sizing: border-box;
  font-size: 72px;
  font-family: 'Germania One';
  -webkit-text-stroke: 1px black;
  color: white;
  font-weight: bold;
  text-align: center;
  vertical-align: middle;
  box-shadow: 0 0 3px 0 #000;
  width: 100%;
  height: 100%;
  opacity: ${({ opacity }) => {
    opacity;
  }};
  ${'' /* margin: auto; */}
  position: ${({ stack }) => {
    if (stack > 0) {
      return 'absolute';
    } else {
      return 'relative';
    }
  }};
  display: block;
  bottom: ${({ stack }) => {
    if (stack) {
      return `${stack * -10}px`;
    } else {
      return '0';
    }
  }};
  left: ${({ type, stack }) => {
    if (stack > 0 && type === PILE_TYPES.DISCARD) {
      return `${stack * 10}px`;
    } else {
      return '0';
    }
  }};
  right: ${({ type, stack }) => {
    if (stack > 0 && type === PILE_TYPES.DISC) {
      return `${stack * 10}px`;
    } else {
      return '0';
    }
  }};
  top: ${({ stack }) => {
    if (stack > 0) {
      return `${stack * 10}px`;
    } else {
      return '0';
    }
  }};
  ${
    '' /* margin-right: ${({ stack }) => {
    if (stack) {
      return `-10px`;
    } else {
      return;
    }
  }}; */
  }
`;

export const Cardback = styled.div`
  display: none;
  ${
    '' /* background-color: #e5e5f7;
  opacity: 0.4;
  background-image: linear-gradient(
      30deg,
      #444cf7 12%,
      transparent 12.5%,
      transparent 87%,
      #444cf7 87.5%,
      #444cf7
    ),
    linear-gradient(
      150deg,
      #444cf7 12%,
      transparent 12.5%,
      transparent 87%,
      #444cf7 87.5%,
      #444cf7
    ),
    linear-gradient(
      30deg,
      #444cf7 12%,
      transparent 12.5%,
      transparent 87%,
      #444cf7 87.5%,
      #444cf7
    ),
    linear-gradient(
      150deg,
      #444cf7 12%,
      transparent 12.5%,
      transparent 87%,
      #444cf7 87.5%,
      #444cf7
    ),
    linear-gradient(
      60deg,
      #444cf777 25%,
      transparent 25.5%,
      transparent 75%,
      #444cf777 75%,
      #444cf777
    ),
    linear-gradient(
      60deg,
      #444cf777 25%,
      transparent 25.5%,
      transparent 75%,
      #444cf777 75%,
      #444cf777
    );
  background-size: 40px 70px;
  background-position: 0 0, 0 0, 20px 35px, 20px 35px, 0 0, 20px 35px;
  border-radius: 15px;
  box-sizing: border-box;
  font-size: 72px;
  font-family: 'Germania One';
  -webkit-text-stroke: 1px black;
  color: white;
  font-weight: bold;
  text-align: center;
  vertical-align: middle;
  box-shadow: 0 0 3px 0 #000;
  width: 100%;
  height: 100%; */
  }
`;

export const Value = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
`;
