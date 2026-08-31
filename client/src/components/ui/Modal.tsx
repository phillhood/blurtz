import React, { useId } from "react";
import { Modal as VoidModal } from "@shychedelic/voidglass-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, title }) => {
  const titleId = useId();

  return (
    <VoidModal
      show={isOpen}
      onClose={onClose}
      showClose={Boolean(title)}
      titleId={title ? titleId : undefined}
    >
      {title && (
        <h2 id={titleId} className="blurtz-modal__title">
          {title}
        </h2>
      )}
      {children}
    </VoidModal>
  );
};

export default Modal;
