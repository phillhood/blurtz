import styled from 'styled-components';

export const ScoreAreaContainer = styled.div`
  display: grid;
  row-gap: 1em;
  height: auto;
  min-height: 80px;
  padding: 10px;
  margin-top: 1%;
  margin-bottom: 1%;
  ${'' /* background-color: white; */}
  border-radius: 25px;
  ${'' /* border: 4px solid black; */}
  grid-template-columns: repeat(8, minmax(10%, 1%));
  justify-content: space-evenly;
  align-content: center;
`;
