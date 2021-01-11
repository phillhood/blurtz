import styled from 'styled-components';
import { CARD_DIMENSIONS } from '../../constants';

export const Cardface = styled.div`
  background-color: ${({ colour }) => colour};
  border: 5px solid ${({ type }) => (type === 'm' ? 'black' : 'white')};
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
