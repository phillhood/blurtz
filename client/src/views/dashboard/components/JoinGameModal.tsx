import React, { useState } from "react";
import { Button, Input } from "@styles";
import { Modal } from "@components/ui";
import { JoinGameRequest } from "@/types";

interface JoinGameModalProps {
  isOpen: boolean;
  onJoinGame: (payload: JoinGameRequest) => void;
  onClose: () => void;
}

const JoinGameModal: React.FC<JoinGameModalProps> = ({
  isOpen,
  onJoinGame,
  onClose,
}) => {
  const [gameCode, setGameCode] = useState("");

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    onJoinGame({ alias: gameCode } as JoinGameRequest);
  };

  const handleClose = () => {
    setGameCode("");
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Join by code">
      <form onSubmit={handleJoin}>
        <div className="blurtz-field">
          <label className="blurtz-field__label" htmlFor="gameCode">
            Table code
          </label>
          <Input
            id="gameCode"
            type="text"
            placeholder="e.g., happy-blue-lemur"
            value={gameCode}
            onChange={(e) => setGameCode(e.target.value)}
            autoFocus
          />
        </div>

        <div className="blurtz-dialog__actions">
          <Button type="button" variant="tertiary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!gameCode.trim()}>
            Join
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default JoinGameModal;
