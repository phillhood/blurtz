import styled from 'styled-components';

export const Wrapper = styled.div`
  height: 100%;
  display: grid;
  padding: 10px;
  grid-template-columns: auto auto auto auto auto auto auto;
  background-colour: white;
  justify-content: space-evenly;
  align-content: center;
`;

export const TwoPlayerContainer = styled.div`
  height: 32%;
  border: 4px solid black;
  border-radius: ${({ player }) => {
    switch (player) {
      case 1:
        return '25px 25px 10px 10px';
      case 2:
        return '10px 10px 25px 25px';
      default:
        return '25px';
    }
  }}
  }
  background-image: ${({ player }) => {
    switch (player) {
      case 1:
        return 'linear-gradient(white, blue)';
      case 2:
        return 'linear-gradient(red, white)';
      default:
        return 'linear-gradient(red, blue)';
    }
  }}
  }
`;
